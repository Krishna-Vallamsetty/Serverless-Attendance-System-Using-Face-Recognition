const AWS = require('aws-sdk');
const s3 = new AWS.S3();
const BUCKET = 'my-attendance-bucket-admin925';

exports.handler = async (event) => {
  try {
    const { filename, filetype } = event.queryStringParameters;
    const key = `uploads/${Date.now()}_${filename}`;

    const params = {
      Bucket: BUCKET,
      Key: key,
      Expires: 300,  // URL valid for 5 minutes
      ContentType: filetype,
    };

    const uploadUrl = await s3.getSignedUrlPromise('putObject', params);

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ uploadUrl, key }),
    };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ message: error.message }) };
  }
};
