import { SQSHandler } from "aws-lambda";
import {
  GetObjectCommand,
  PutObjectCommandInput,
  GetObjectCommandInput,
  S3Client,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

const s3 = new S3Client();

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

      }
    }
  }
};