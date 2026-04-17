exports.handler = async function(event) {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }
   
    try {
      const { body, secret } = JSON.parse(event.body);
   
      const response = await fetch('https://api.finbotai.co.il/income', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'secret': secret
        },
        body: JSON.stringify(body)
      });
   
      const rawText = await response.text();
   
      // נסה לפרסר כ-JSON, אם לא — עטוף בהודעת שגיאה
      let data;
      try {
        data = JSON.parse(rawText);
      } catch {
        data = { error: `Finbot returned (${response.status}): ${rawText}` };
      }
   
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify(data)
      };
    } catch (err) {
      return {
        statusCode: 500,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: err.message })
      };
    }
  };