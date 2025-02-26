import { OpenAI } from 'openai';
import { NextResponse } from 'next/server';

// Add debug logging for API key
const apiKey = process.env.OPENAI_API_KEY;
console.log('API Key available:', !!apiKey); // Just logs whether key exists, not the key itself

const openai = new OpenAI({
  apiKey: apiKey,
});

export async function POST(req: Request) {
  console.log('API route called');
  
  try {
    // Check if API key is available
    if (!apiKey) {
      console.error('OpenAI API key is not configured');
      return NextResponse.json(
        { 
          error: 'OpenAI API key is not configured',
          details: 'Please check your environment variables'
        },
        { status: 500 }
      );
    }

    const { messages } = await req.json();
    console.log('Received messages:', JSON.stringify(messages, null, 2));

    try {
      console.log('Calling OpenAI API...');
      const response = await openai.chat.completions.create({
        model: 'chatgpt-4o-latest',
        messages,
        temperature: 0.7,
        max_tokens: 1000,
      });

      console.log('OpenAI response received');
      console.log('Response content:', response.choices[0].message.content);

      return NextResponse.json({
        content: response.choices[0].message.content,
      });
    } catch (openaiError: any) {
      // If the model is not available, try fallback model
      if (openaiError.code === 'model_not_found') {
        console.log('Attempting fallback to gpt-4o-mini...');
        const fallbackResponse = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages,
          temperature: 0.7,
          max_tokens: 1000,
        });

        return NextResponse.json({
          content: fallbackResponse.choices[0].message.content,
        });
      }

      console.error('OpenAI API call failed:', {
        message: openaiError.message,
        code: openaiError.code,
        type: openaiError.type,
        stack: openaiError.stack
      });
      
      return NextResponse.json(
        {
          error: 'OpenAI API call failed',
          details: openaiError.message,
          code: openaiError.code,
          type: openaiError.type
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('Request processing error:', {
      message: error.message,
      stack: error.stack
    });
    
    return NextResponse.json(
      { 
        error: error.message || 'Failed to process request',
        details: error.toString(),
        stack: error.stack
      },
      { status: 500 }
    );
  }
}
