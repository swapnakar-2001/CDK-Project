import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as cwActions from 'aws-cdk-lib/aws-cloudwatch-actions';

interface MonitoringStackProps extends cdk.StackProps {
  envName: 'Dev' | 'Staging';
}

export class MonitoringStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, props);

    const { envName } = props;

    // ================= NAMING PREFIX =================
    const prefix =
      envName === 'Dev' ? 'AHS-EHR-Dev' : 'AHS-EHR-Staging';

    // ================= TAGS =================
    cdk.Tags.of(this).add('Environment', envName);

    // ================= ENV CONFIG =================
    const envConfig: any = {
      Dev: {
        snsTopicArn:
          'arn:aws:sns:ap-south-1:829876691474:AHS-EHR-Dev-CloudWatch-Alerts',

        albArns: [
          'app/k8s-arcaaideveksing-0f33c6f686/d5bbcea83bc5f771'
        ],

        clusterName: 'AHS-EHR-Dev-arcaquest-eks',

        namespaces: [
          'docsearch-dev',
          'emrsearchenginehttp-dev',
          'ocr-dev',
          'arcaquest-dev'
        ],

        serviceNamespaces: {
          'arcaai-dev-frontend': [
            'arca-emr-frontend-service',
            'arca-admin-frontend-service'
          ]
        }
      },

      Staging: {
        snsTopicArn:
          'arn:aws:sns:ap-south-1:829876691474:AHS-EHR-Staging-CloudWatch-Alerts',

        albArns: [
          'app/k8s-arcaaistagingeksi-f3c1c220f6/35fc3972e9fdee44'
        ],

        clusterName: 'AHS-EHR-Staging-arcaquest-eks',

        namespaces: [
          'docsearch-staging',
          'emrsearchenginehttp-staging',
          'ocr-staging',
          'arcaquest-staging'
        ],

        serviceNamespaces: {
          'arcaai-staging-frontend': [
            'arca-emr-frontend-service',
            'arca-admin-frontend-service'
          ]
        }
      }
    };

    const config = envConfig[envName];

    // ================= EXISTING SNS TOPIC =================
    const alertsTopic = sns.Topic.fromTopicArn(
      this,
      `${prefix}-ExistingAlertsTopic`,
      config.snsTopicArn
    );

    // ================= ALB ALARMS =================
    config.albArns.forEach((alb: string) => {
      const albMetrics = [
        { name: 'HTTPCode_ELB_5XX_Count', threshold: 20 },
        { name: 'HTTPCode_ELB_4XX_Count', threshold: 50 },
        { name: 'RequestCount', threshold: 10000 },
        { name: 'TargetResponseTime', threshold: 2 }
      ];

      albMetrics.forEach(metric => {
        const alarm = new cloudwatch.Alarm(
          this,
          `${prefix}-ALB-${metric.name}`,
          {
            alarmName: `${prefix}-ALB-${metric.name}`,
            metric: new cloudwatch.Metric({
              namespace: 'AWS/ApplicationELB',
              metricName: metric.name,
              dimensionsMap: { LoadBalancer: alb },
              statistic: 'Sum',
              period: cdk.Duration.minutes(5)
            }),
            threshold: metric.threshold,
            evaluationPeriods: 1,
            comparisonOperator:
              cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD
          }
        );

        alarm.addAlarmAction(new cwActions.SnsAction(alertsTopic));
        alarm.addOkAction(new cwActions.SnsAction(alertsTopic));
      });
    });

    // ================= NAMESPACE-LEVEL POD ALARMS =================
    config.namespaces.forEach((ns: string) => {
      const metrics = [
        { name: 'pod_cpu_utilization', threshold: 90, stat: 'Average' },
        { name: 'pod_memory_utilization', threshold: 90, stat: 'Average' },
        { name: 'pod_number_of_container_restarts', threshold: 3, stat: 'Sum' },
        { name: 'service_number_of_running_pods', threshold: 1, stat: 'Minimum' }
      ];

      metrics.forEach(metric => {
        const alarm = new cloudwatch.Alarm(
          this,
          `${prefix}-${ns}-${metric.name}`,
          {
            alarmName: `${prefix}-${ns}-${metric.name}`,
            metric: new cloudwatch.Metric({
              namespace: 'ContainerInsights',
              metricName: metric.name,
              dimensionsMap: {
                ClusterName: config.clusterName,
                Namespace: ns
              },
              statistic: metric.stat,
              period: cdk.Duration.minutes(5)
            }),
            threshold: metric.threshold,
            evaluationPeriods: 1,
            comparisonOperator:
              metric.name === 'service_number_of_running_pods'
                ? cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD
                : cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD
          }
        );

        alarm.addAlarmAction(new cwActions.SnsAction(alertsTopic));
        alarm.addOkAction(new cwActions.SnsAction(alertsTopic));
      });
    });

    // ================= SERVICE-LEVEL POD ALARMS =================
    Object.entries(config.serviceNamespaces as Record<string, string[]>)
      .forEach(([namespace, services]) => {
        services.forEach(service => {
          const metrics = [
            { name: 'pod_cpu_utilization', threshold: 90, stat: 'Average' },
            { name: 'pod_memory_utilization', threshold: 90, stat: 'Average' },
            { name: 'pod_number_of_container_restarts', threshold: 3, stat: 'Sum' },
            { name: 'service_number_of_running_pods', threshold: 1, stat: 'Minimum' }
          ];

          metrics.forEach(metric => {
            const alarm = new cloudwatch.Alarm(
              this,
              `${prefix}-${service}-${metric.name}`,
              {
                alarmName: `${prefix}-${service}-${metric.name}`,
                metric: new cloudwatch.Metric({
                  namespace: 'ContainerInsights',
                  metricName: metric.name,
                  dimensionsMap: {
                    ClusterName: config.clusterName,
                    Namespace: namespace,
                    Service: service
                  },
                  statistic: metric.stat,
                  period: cdk.Duration.minutes(5)
                }),
                threshold: metric.threshold,
                evaluationPeriods: 1,
                comparisonOperator:
                  metric.name === 'service_number_of_running_pods'
                    ? cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD
                    : cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD
              }
            );

            alarm.addAlarmAction(new cwActions.SnsAction(alertsTopic));
            alarm.addOkAction(new cwActions.SnsAction(alertsTopic));
          });
        });
      });

    // ================= NODE / CLUSTER ALARMS =================
    const nodeMetrics = [
      { name: 'node_memory_utilization', threshold: 80 },
      { name: 'node_cpu_utilization', threshold: 80 },
      { name: 'cluster_node_count', threshold: 2 },
      { name: 'node_filesystem_utilization', threshold: 85 },
      { name: 'cluster_failed_node_count', threshold: 1 }
    ];

    nodeMetrics.forEach(metric => {
      const alarm = new cloudwatch.Alarm(
        this,
        `${prefix}-WorkerNode-${metric.name}`,
        {
          alarmName: `${prefix}-WorkerNode-${metric.name}`,
          metric: new cloudwatch.Metric({
            namespace: 'ContainerInsights',
            metricName: metric.name,
            dimensionsMap: {
              ClusterName: config.clusterName
            },
            statistic: 'Average',
            period: cdk.Duration.minutes(5)
          }),
          threshold: metric.threshold,
          evaluationPeriods: 1,
          comparisonOperator:
            cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD
        }
      );

      alarm.addAlarmAction(new cwActions.SnsAction(alertsTopic));
      alarm.addOkAction(new cwActions.SnsAction(alertsTopic));
    });
  }
}
