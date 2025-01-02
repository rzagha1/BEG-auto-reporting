const fetch = require('node-fetch');
const fs = require('fs').promises;
const path = require('path');

async function queryEsriFeaturesBasic(url, fields, where = '1=1', maxRecordCount = 1000) {
    let allFeatures = [];
    const queryUrl = `${url}/query?where=${encodeURIComponent(where)}&outFields=${fields.join(',')}&returnGeometry=false&f=json`;   
    const response = await fetch(queryUrl);
    const data = await response.json(); 
    allFeatures = allFeatures.concat(data.features.map(f => f.attributes));     
return allFeatures;
}

async function queryEsriFeatures(url, fields, where = '1=1', maxRecordCount = 1000) {
  let allFeatures = [];
  let resultOffset = 0;
  let keepFetching = true;
  while (keepFetching) {
    const queryUrl = `${url}/query?where=${encodeURIComponent(where)}&outFields=${fields.join(',')}&returnGeometry=false&resultOffset=${resultOffset}&resultRecordCount=${maxRecordCount}&f=json`;   
    const response = await fetch(queryUrl);
    const data = await response.json(); 
    if (data.error) {
      throw new Error(`ESRI API Error: ${data.error.message}`);
    }
    if (!data.features || data.features.length === 0) {
      keepFetching = false;
    } else {
      allFeatures = allFeatures.concat(data.features.map(f => f.attributes));      
      if (!data.exceededTransferLimit) {
        keepFetching = false;
      }
      resultOffset += data.features.length;
    }
  }
  return allFeatures;
}

async function queryFeatureAttachments(baseUrl, objectId) {
  const attachmentUrl = `${baseUrl}/${objectId}/attachments?f=json`;
  const response = await fetch(attachmentUrl);
  const data = await response.json();  
  if (data.error) {
      throw new Error(`ESRI API Error: ${data.error.message}`);
  }
  return data.attachmentInfos || [];
}

async function queryFeaturesWithAttachments(url, fields, where = '1=1', maxRecordCount = 1000) {
    const features = await queryEsriFeatures(url, fields, where, maxRecordCount);  
    const featuresWithPicUrl = await Promise.all(
        features.map(async (feature) => {
            try {
                const attachments = await queryFeatureAttachments(url, feature.objectid);
                // Get only the first image attachment URL
                const picUrl = attachments.length > 0 
                    ? `${url}/${feature.objectid}/attachments/${attachments[0].id}`
                    : null;
                
                // Add the imageFilename that will be used when downloading
                const imageFilename = picUrl ? `${feature.objectid}.jpg` : null;
                    
                return {
                    ...feature,
                    picUrl,
                    imageFilename  // Add this to the feature object
                };
            } catch (error) {
                console.error(`Error fetching attachments for feature ${feature.objectid}:`, error);
                return {
                    ...feature,
                    picUrl: null,
                    imageFilename: null
                };
            }
        })
    );
    
    // Download the images and get the results
    //const downloadResults = await downloadAllImages(featuresWithPicUrl, './feature_images');
    //console.log('Download results:', downloadResults);
    
    return featuresWithPicUrl;
  }
  

// Function to clean directory
async function cleanDirectory(directory) {
    try {
        // Check if directory exists
        try {
            await fs.access(directory);
        } catch {
            // If directory doesn't exist, create it
            await fs.mkdir(directory, { recursive: true });
            return;
        }

        // Read directory contents
        const files = await fs.readdir(directory);
        
        // Delete all files in the directory
        await Promise.all(
            files.map(file => 
                fs.unlink(path.join(directory, file))
            )
        );
    } catch (error) {
        console.error('Error cleaning directory:', error);
        throw error;
    }
}

// Function to download a single image
async function downloadImage(imageUrl, outputPath) {
    try {
        const response = await fetch(imageUrl);
        if (!response.ok) {
            throw new Error(`Failed to download image: ${response.statusText}`);
        }
        const buffer = await response.buffer();
        await fs.writeFile(outputPath, buffer);
        return {
            success: true,
            path: outputPath
        };
    } catch (error) {
        console.error(`Error downloading image from ${imageUrl}:`, error);
        return {
            success: false,
            error: error.message
        };
    }
}

// Function to download all images for features
async function downloadAllImages(features, outputDir = './images') {
    try {
        // Clean/create the output directory
        await cleanDirectory(outputDir);

        const downloads = await Promise.all(
            features
                .filter(f => f.picUrl) // Only process features with picture URLs
                .map(async (feature) => {
                    const fileName = `${feature.objectid}.jpg`; // Using objectid as filename
                    const filePath = path.join(outputDir, fileName);
                    
                    const result = await downloadImage(feature.picUrl, filePath);
                    console.log(`Downloaded image for objectid ${feature.objectid}:`, result);
                    
                    return {
                        objectid: feature.objectid,
                        ...result,
                        fileName
                    };
                })
        );

        // Return download results with mapping to features
        return downloads;
    } catch (error) {
        console.error('Error in downloadAllImages:', error);
        throw error;
    }
}

module.exports = { 
    queryEsriFeaturesBasic,
    queryEsriFeatures,
    queryFeatureAttachments,
    queryFeaturesWithAttachments,
    downloadAllImages,
    cleanDirectory
};