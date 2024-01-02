//fix this code

import { SQSHandler } from "aws-lambda";
import {
  GetObjectCommand,
  PutObjectCommandInput,
  GetObjectCommandInput,
  S3Client,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { DynamoDBStreamHandler } from "aws-lambda";

const s3 = new S3Client();
const ddbClient = new DynamoDBClient({ region: process.env.REGION });

export const handler: SQSHandler = async (event) => {
  console.log("Event ", event);
  
  for (const record of event.Records) {
    const recordBody = JSON.parse(record.body);  
    console.log('Raw SNS message ',JSON.stringify(recordBody))

    if (recordBody.Records) {

      for (const messageRecord of recordBody.Records) {
        const s3e = messageRecord.s3;
        const srcBucket = s3e.bucket.name;
        const srcKey = decodeURIComponent(s3e.object.key.replace(/\+/g, " "));
        const typeMatch = srcKey.match(/\.([^.]*)$/);

        if (!typeMatch) {
          console.log("Unable to determine type.");
          throw new Error("Unable to determine type. ");
        }

        const imageType = typeMatch[1].toLowerCase();
        if (imageType != "jpeg" && imageType != "png") {
          console.log(`Unsupported type: ${imageType}`);
          throw new Error("Unsupported type: ${imageType. ");
        }

        const imageName = s3e.object.key;
        const dynamoDBItem = {
          key: imageName
        }

        try {
          await ddbClient.send(
                new PutCommand({
                  TableName: process.env.TABLE_NAME,
                  Item:  dynamoDBItem ,
                })
              );
          console.log(`Successful image process ${imageName}`);
        } catch (error) {
          console.error(`Failed image process ${imageName}: ${error}`);
        }

      }
    }
  }
};

export const dynamohandler: DynamoDBStreamHandler = async (event) => {
  try {
    for (const record of event.Records) {
      if (record.eventName === "INSERT") {
        const imageInfo = record.dynamodb?.NewImage;
        const img = imageInfo?.img; 

        
        console.log(`Image added to DynamoDB: ${img}`);
      }
    }
  } catch (error) {
    console.error(`Error processing DynamoDB stream: ${error}`);
    throw error;
  }
};