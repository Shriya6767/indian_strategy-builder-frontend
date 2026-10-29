import { logError, logWarn } from './fileLog';

const LOG_LEVELS = {
  ERROR: 'ERROR',
  SUCCESS: 'SUCCESS',
  REQUEST: 'REQUEST',
  RESPONSE: 'RESPONSE',
  CONTEXT: 'CONTEXT',
  WARNING: 'WARNING'
};

const logger = {
  error: (message, data = null) => {
    console.error(`[ERROR] ${message}`, data ? data : '');
    // The message only -- `data` can hold a response body, which does not
    // belong in a file. See src/utils/fileLog.js.
    logError(message);
  },

  success: (message, data = null) => {
    console.log(`[SUCCESS] ${message}`, data ? data : '');
  },

  warning: (message, data = null) => {
    console.warn(`[WARNING] ${message}`, data ? data : '');
    logWarn(message);
  },

  request: (endpoint, requestDetails) => {
    console.log(`API REQUEST: ${endpoint}`);
    console.log(`${requestDetails.method || 'GET'} ${requestDetails.url || ''}`);
    
    if (requestDetails.parameters) {
      console.log('Query Parameters:', JSON.stringify(requestDetails.parameters, null, 2));
    }
    
    if (requestDetails.body) {
      // Logged without a label so the JSON can be copied straight out of the console.
      console.log(JSON.stringify(requestDetails.body, null, 2));
    }
  },

  response: (endpoint, responseDetails) => {
    const status = responseDetails.status || 200;
    console.log(`API RESPONSE: ${endpoint}`);
    console.log(`Status: ${status}`);
    
    if (responseDetails.data) {
      console.log('Response Body:', JSON.stringify(responseDetails.data, null, 2));
    }
  },

  context: (action, data) => {
    console.log(`[CONTEXT] ${action}`, data);
  }
};

export default logger;
