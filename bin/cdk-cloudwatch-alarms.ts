#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { MonitoringStack } from '../lib/monitoring-stack';

const app = new cdk.App();

// Dev
new MonitoringStack(app, 'AHS-EHR-Dev-Monitoring-Stack', {
  envName: 'Dev'
});

// Staging
new MonitoringStack(app, 'AHS-EHR-Staging-Monitoring-Stack', {
  envName: 'Staging'
});
