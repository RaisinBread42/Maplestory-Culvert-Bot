from azure.storage.blob import BlobServiceClient
from azure.cosmos import CosmosClient, PartitionKey
import configparser
config = configparser.ConfigParser()
config.read('config.ini')

#load image from blob storage
connection_string = config.get('blobstorage', 'conn_string')
container_name = "culvert-images"
blob_name = "image.png"  # Replace this with the name of your image

# Create a BlobServiceClient to interact with the Blob storage
blob_service_client = BlobServiceClient.from_connection_string(connection_string)

# Get a reference to the blob using the container and blob name
blob_client = blob_service_client.get_blob_client(container=container_name, blob=blob_name)

# Download the blob to a local file (e.g., "downloaded_image.jpg")
with open("downloaded_image.jpg", "wb") as f:
    data = blob_client.download_blob()
    data.readinto(f)

print("Image downloaded successfully.")

# -------------------------------
# Begin to scrape culvert scores using OCR
# To do
# -------------------------------

print("Extracted results from OCR.")
results = {
    "id": "SingularityX",
    "scores": [
        {
            "amount": 20000,
            "date": "07-07-2023"
        },
        {
            "amount": 19000,
            "date": "07-06-2023"
        },
        {
            "amount": 18000,
            "date": "07-05-2023"
        }
    ]
}

# save results to database
print("Saving scores to database.")
endpoint = config.get('cosmosdb', 'endpoint')
key = config.get('cosmosdb', 'key')
database_name = config.get('cosmosdb', 'db_name')
container_name = config.get('cosmosdb', 'container_name')
partition_key_value = config.get('cosmosdb', 'container_partition_key')

# Initialize the CosmosClient
client = CosmosClient(endpoint, key)

# Get a reference to the database
database = client.get_database_client(database_name)

# Get a reference to the container
container = database.get_container_client(container_name)

# Define the document you want to update
document_id = results["id"]

# Retrieve the existing document
response = container.read_item(item=document_id, partition_key=partition_key_value)

# Update the properties in the document
# Loop through and find any with same date. If so update, else add to score list
for x in results["scores"]:
    exists = False
    i = 0
    for s in response["scores"]:
        if(x["date"] == s["date"]):
            response["scores"][i]["amount"] = x["amount"]
            exists = True
        i+=1
    
    if(exists == False):
        response["scores"].append(x)

# Create the item in the container
container.replace_item(item=response, body=response)

# return success
print("Saved culvert scores to database successfully")