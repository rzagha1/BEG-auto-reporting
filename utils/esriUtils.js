const fetch = require('node-fetch');

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

module.exports = { queryEsriFeatures };