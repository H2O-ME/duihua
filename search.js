class SearchAPI {
    constructor() {
        this.API_KEY = '0ed7db8a20fd4b6f9a0e2011efb557f7.stnKl4XPxSZYZr1B';
        this.API_URL = 'https://open.bigmodel.cn/api/paas/v4/tools';
    }

    async search(query) {
        try {
            const response = await fetch(this.API_URL, {
                method: 'POST',
                headers: {
                    'Authorization': this.API_KEY,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    tool: 'web-search-pro',
                    messages: [{
                        role: 'user',
                        content: query
                    }],
                    stream: false
                })
            });

            const data = await response.json();
            return this.parseSearchResults(data);
        } catch (error) {
            console.error('搜索请求失败:', error);
            return [];
        }
    }

    parseSearchResults(data) {
        try {
            const results = data.choices[0].message.tool_calls.find(
                call => call.type === 'search_result'
            )?.search_result || [];

            return results.map(result => ({
                title: result.title,
                content: result.content,
                link: result.link,
                media: result.media
            }));
        } catch (error) {
            console.error('解析搜索结果失败:', error);
            return [];
        }
    }
}

// 导出搜索API类
export default SearchAPI; 