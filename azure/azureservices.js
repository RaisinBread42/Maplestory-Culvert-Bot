const fs = require("fs");
const containerName = `culvert-images`;
const { BlobServiceClient, StorageSharedKeyCredential } = require("@azure/storage-blob");
const config = require('../config.json');
const sharedKeyCredential = new StorageSharedKeyCredential(config.azureBlobStorage.account, config.azureBlobStorage.accountKey);
const blobServiceClient = new BlobServiceClient(
    `https://${config.azureBlobStorage.account}.blob.core.windows.net`,
    sharedKeyCredential
  );
  
async function uploadImage(imagePath, blobName){
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blobClient = containerClient.getBlockBlobClient(blobName);
  
    const stream = fs.createReadStream(imagePath);
    const uploadBlobResponse = await blobClient.uploadStream(stream);
  
    console.log(`Image uploaded successfully. Blob URL: ${uploadBlobResponse._response.request.url}`);

}

module.exports = { uploadImage }