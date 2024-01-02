import * as cdk from "aws-cdk-lib";
import * as lambdanode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as events from "aws-cdk-lib/aws-lambda-event-sources";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subs from "aws-cdk-lib/aws-sns-subscriptions";
import * as iam from "aws-cdk-lib/aws-iam";

import { Construct } from "constructs";
import { Duration, RemovalPolicy } from "aws-cdk-lib";
import { SqsDestination } from "aws-cdk-lib/aws-lambda-destinations";
import { AttributeType, BillingMode, StreamViewType, Table } from "aws-cdk-lib/aws-dynamodb";
import { StartingPosition } from "aws-cdk-lib/aws-lambda";
import { DynamoEventSource } from "aws-cdk-lib/aws-lambda-event-sources";

export class AsgnCA2AppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const imagesBucket = new s3.Bucket(this, "images", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      publicReadAccess: false,
    });

    const imageTable = new Table(this, "ImageTable", {
      billingMode: BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: "imageName", type: AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      tableName: "Images",
      stream: StreamViewType.NEW_IMAGE,
    })

    // Integration infrastructure

    const failImageQueue = new sqs.Queue(this, "img-fail-queue", {
      receiveMessageWaitTime: cdk.Duration.seconds(10),
      retentionPeriod: Duration.minutes(30),
    });

    const imageProcessQueue = new sqs.Queue(this, "img-created-queue", {
      receiveMessageWaitTime: cdk.Duration.seconds(10),
      deadLetterQueue: {
        queue: failImageQueue,
        maxReceiveCount: 2,
      },
    });

    const mailerQ = new sqs.Queue(this, "mailer-queue", {
      receiveMessageWaitTime: cdk.Duration.seconds(10),
    });

    const negMailQ = new sqs.Queue(this, "neg-mail-queue", {
      receiveMessageWaitTime: cdk.Duration.seconds(10),
    });

    const newImageTopic = new sns.Topic(this, "NewImageTopic", {
      displayName: "New Image topic",
    }); 
    
  // Lambda functions

  const processImageFn = new lambdanode.NodejsFunction(
    this,
    "ProcessImageFn",
    {
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: `${__dirname}/../lambdas/processImage.ts`,
      onFailure: new SqsDestination(failImageQueue),
      timeout: cdk.Duration.seconds(15),
      memorySize: 128,
      environment: {
        REGION: cdk.Aws.REGION,
        TABLE_NAME: imageTable.tableName,
      },
    }
  );

  const mailerFn = new lambdanode.NodejsFunction(this, "mailer-function", {
    runtime: lambda.Runtime.NODEJS_16_X,
    memorySize: 1024,
    timeout: cdk.Duration.seconds(3),
    entry: `${__dirname}/../lambdas/mailer.ts`,
  });

  const negMailFn = new lambdanode.NodejsFunction(this, "neg-mail-function", {
    runtime: lambda.Runtime.NODEJS_16_X,
    memorySize: 1024,
    timeout: cdk.Duration.seconds(3),
    entry: `${__dirname}/../lambdas/negMail.ts`,
  });

  // Event triggers

  imagesBucket.addEventNotification(
    s3.EventType.OBJECT_CREATED,
    new s3n.SnsDestination(newImageTopic)  
);

newImageTopic.addSubscription(
  new subs.SqsSubscription(imageProcessQueue, {
    filterPolicyWithMessageBody: {
      Records: sns.FilterOrPolicy.policy({
        s3: sns.FilterOrPolicy.policy({
          object: sns.FilterOrPolicy.policy({
            key: sns.FilterOrPolicy.filter(
              sns.SubscriptionFilter.stringFilter({
                matchPrefixes: ["*.jpeg", "*.png"],
              }),

            ),
          }),
        }),
      })
    },
    rawMessageDelivery: true,
  })
);

newImageTopic.addSubscription(new subs.SqsSubscription(mailerQ));

  const newImageMailEventSource = new events.SqsEventSource(mailerQ, {
    batchSize: 5,
    maxBatchingWindow: cdk.Duration.seconds(10),
  }); 

  const newNegImageMailEventSource = new events.SqsEventSource(negMailQ, {
    batchSize: 5,
    maxBatchingWindow: cdk.Duration.seconds(10),
  }); 

  mailerFn.addEventSource(newImageMailEventSource);
  negMailFn.addEventSource(newNegImageMailEventSource);

  processImageFn.addEventSource(
    new DynamoEventSource(imageTable, {
      startingPosition: StartingPosition.LATEST,
    })
  )

  // Permissions

  imagesBucket.grantRead(processImageFn);
  imageTable.grantWriteData(processImageFn);

  mailerFn.addToRolePolicy(
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        "ses:SendEmail",
        "ses:SendRawEmail",
        "ses:SendTemplatedEmail",
      ],
      resources: ["*"],
    })
  );

  negMailFn.addToRolePolicy(
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        "ses:SendEmail",
        "ses:SendRawEmail",
        "ses:SendTemplatedEmail",
      ],
      resources: ["*"],
    })
  );

  // Output
  
  new cdk.CfnOutput(this, "bucketName", {
    value: imagesBucket.bucketName,
  });

  }
}
