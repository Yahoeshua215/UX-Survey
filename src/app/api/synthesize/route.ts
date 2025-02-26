import { OpenAI } from 'openai';
import { NextResponse } from 'next/server';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { surveyTitle, surveyResponses } = await req.json();

    console.log('Processing survey:', surveyTitle);
    console.log('Number of responses:', surveyResponses.length);

    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        {
          role: "system",
          content: `You are a survey analysis expert. Analyze the survey responses and provide a comprehensive synthesis of the results. Include:
          1. Key findings and patterns
          2. Common themes in responses
          3. Notable insights
          4. Any significant correlations
          5. Summary statistics where applicable
          Format the response in clear sections with markdown headings.`
        },
        {
          role: "user",
          content: `Please analyze this survey titled "${surveyTitle}" with the following responses: ${JSON.stringify(surveyResponses, null, 2)}`
        }
      ],
      temperature: 0.7,
      max_tokens: 2000,
    });

    console.log('Synthesis completed successfully');
    return NextResponse.json({ result: response.choices[0].message.content });
  } catch (error) {
    console.error('Error in /api/synthesize:', error);
    return NextResponse.json(
      { error: 'Failed to synthesize results' },
      { status: 500 }
    );
  }
} 