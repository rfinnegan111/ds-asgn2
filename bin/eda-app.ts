#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { AsgnCA2AppStack } from "../lib/asgn2-app-stack";

const app = new cdk.App();
new AsgnCA2AppStack(app, "AsgnCA2Stack", {
  env: { region: "eu-west-1" },
});
