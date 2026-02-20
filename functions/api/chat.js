// functions/api/chat.js

export async function onRequestPost(context) {
    try {
        // 1. 获取前端发来的问题
        const { prompt } = await context.request.json();
        
        // 2. 从 Cloudflare 的环境变量中安全读取 API Key
        // 这个变量必须在 Cloudflare Pages 的后台设置面板中配置
        const apiKey = context.env.ZHIPU_API_KEY;
        
        if (!apiKey) {
            return new Response(JSON.stringify({ error: "服务器未配置 API Key" }), { 
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // 3. 在后端安全地向智谱 API 发起请求
        const zhipuUrl = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
        const response = await fetch(zhipuUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "glm-4",
                messages: [
                    {
                        "role": "system",
                        "content": "你是一位专业的金融专家和财神爷。你的任务是解答用户的金融、理财、宏观经济走势、个人投资问题。你的语气应该专业、可靠、数据驱动，同时带有一点幽默和新年的喜庆感。"
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                temperature: 0.7
            })
        });

        const data = await response.json();
        
        // 4. 将智谱的回复安全地传回给你的前端
        return new Response(JSON.stringify({ reply: data.choices[0].message.content }), {
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        // 捕获并返回任何错误信息，方便你在前端排查问题
        return new Response(JSON.stringify({ error: error.message }), { 
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}