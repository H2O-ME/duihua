import SearchAPI from './search.js';

document.addEventListener('DOMContentLoaded', async function() {
    // 1. 声明变量
    const searchAPI = new SearchAPI();
    const searchResults = document.getElementById('searchResults');
    const chatContainer = document.getElementById('chatContainer');
    const textInput = document.getElementById('textInput');
    const sendBtn = document.getElementById('sendBtn');
    const startVoiceBtn = document.getElementById('startVoice');

    let mediaRecorder = null;
    let audioChunks = [];
    let recognition = null;
    let conversationHistory = [];
    let nextSentenceTimer = null;

    const API_KEY = 'sk-hyeudoewxhrzksdcsfbyzkprbocvedmdhydzzmmpuohxxphs';
    const API_BASE_URL = 'https://api.siliconflow.cn/v1';
    const CHAT_API_URL = 'https://api.siliconflow.cn/chat/completions';

    // 2. 语音相关函数
    function stopVoiceRecognition() {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
            mediaRecorder.stream.getTracks().forEach(track => track.stop());
            startVoiceBtn.style.backgroundColor = '';
            startVoiceBtn.style.color = '';
            document.querySelector('.circle-background').classList.remove('recording');
        }
    }

    function startVoiceRecognition() {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            const startVoiceBtn = document.getElementById('startVoice');
            const circleBackground = document.querySelector('.circle-background');
            
            navigator.mediaDevices.getUserMedia({ 
                audio: {
                    channelCount: 1,
                    sampleRate: 16000,
                    echoCancellation: true,
                    noiseSuppression: true
                }
            })
            .then(stream => {
                try {
                    mediaRecorder = new MediaRecorder(stream);
                    audioChunks = [];
                    
                    mediaRecorder.ondataavailable = (event) => {
                        if (event.data.size > 0) {
                            audioChunks.push(event.data);
                        }
                    };

                    mediaRecorder.onstart = () => {
                        startVoiceBtn.classList.add('recording');
                        circleBackground.className = 'circle-background recording';
                    };

                    mediaRecorder.onstop = async () => {
                        try {
                            startVoiceBtn.classList.remove('recording');
                            
                            // 切换到识别状态
                            circleBackground.className = 'circle-background recognizing';
                            
                            const audioBlob = new Blob(audioChunks);
                            const transcribedText = await speechToText(audioBlob);
                            
                            if (transcribedText) {
                                textInput.value = transcribedText;
                                
                                // 切换到思考状态
                                circleBackground.className = 'circle-background thinking';
                                
                                await sendMessage();
                                
                                // 恢复正常状态
                                circleBackground.className = 'circle-background';
                            }
                        } catch (error) {
                            console.error('语音处理错误:', error);
                            addMessage('抱歉，语音识别失败，请重试。', false);
                            circleBackground.className = 'circle-background';
                        }
                    };
                    
                    mediaRecorder.start(100);
                } catch (error) {
                    console.error('初始化录音失败:', error);
                    addMessage('无法启动录音，请检查麦克风权限。', false);
                    circleBackground.className = 'circle-background';
                }
            })
            .catch(error => {
                console.error('获取麦克风失败:', error);
                addMessage('无法访问麦克风，请检查权限设置。', false);
                circleBackground.className = 'circle-background';
            });
        } else {
            addMessage('您的浏览器不支持语音识别功能。', false);
        }
    }

    // 3. 语音识别函数
    async function speechToText(audioBlob, retryCount = 0) {
        const MAX_RETRIES = 3;
        const TIMEOUT = 60000;
        
        const formData = new FormData();
        console.log('音频数据大小:', audioBlob.size, 'bytes');
        
        if (audioBlob.size === 0) {
            throw new Error('音频数据为空');
        }

        // 创建文件对象并添加到表单
        const file = new File([audioBlob], "0_XiaoMi.wav", { 
            type: "audio/wav" 
        });
        formData.append('file', file);
        formData.append('model', 'FunAudioLLM/SenseVoiceSmall');

        try {
            console.log(`开始发送语音识别请求... (尝试 ${retryCount + 1}/${MAX_RETRIES + 1})`);
            
            const controller = new AbortController();
            const timeout = setTimeout(() => {
                controller.abort();
                console.log('请求即将超时，准备重试...');
            }, TIMEOUT);

            // 修改请求选项，移除 Content-Type
            const options = {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${API_KEY}`
                },
                body: formData,
                signal: controller.signal
            };

            const response = await fetch(`${API_BASE_URL}/audio/transcriptions`, options);
            clearTimeout(timeout);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('原始错误响应:', errorText);
                
                if (response.status >= 500 && retryCount < MAX_RETRIES) {
                    console.log(`服务器错误，等待重试... (${retryCount + 1}/${MAX_RETRIES})`);
                    await new Promise(resolve => setTimeout(resolve, 2000 * (retryCount + 1)));
                    return speechToText(audioBlob, retryCount + 1);
                }
                
                throw new Error(`语音识别请求失败: ${response.status} - ${errorText}`);
            }

            const data = await response.json();
            console.log('响应数据:', data);
            
            if (!data.text) {
                throw new Error('未能识别到有效的语音内容');
            }
            
            console.log('语音识别结果:', data.text);
            return data.text;
        } catch (error) {
            if (error.name === 'AbortError') {
                if (retryCount < MAX_RETRIES) {
                    console.log(`请求超时，准备重试... (${retryCount + 1}/${MAX_RETRIES})`);
                    await new Promise(resolve => setTimeout(resolve, 2000 * (retryCount + 1)));
                    return speechToText(audioBlob, retryCount + 1);
                }
                throw new Error('语音识别请求多次超时，请重试');
            }
            throw error;
        }
    }

    // 4. 初始化按钮事件
    function initializeVoiceButton() {
        const startVoiceBtn = document.getElementById('startVoice');
        let isRecording = false;

        const startRecording = (e) => {
            e.preventDefault();
            if (!isRecording) {
                isRecording = true;
            startVoiceRecognition();
            }
        };

        const stopRecording = () => {
            if (isRecording) {
                isRecording = false;
            if (mediaRecorder && mediaRecorder.state === 'recording') {
                    mediaRecorder.stop();
                    mediaRecorder.stream.getTracks().forEach(track => track.stop());
                }
            }
        };

        // 移动端事件
        startVoiceBtn.addEventListener('touchstart', startRecording);
        startVoiceBtn.addEventListener('touchend', stopRecording);
        startVoiceBtn.addEventListener('touchcancel', stopRecording);

        // 桌面端事件
        startVoiceBtn.addEventListener('mousedown', startRecording);
        startVoiceBtn.addEventListener('mouseup', stopRecording);
        startVoiceBtn.addEventListener('mouseleave', stopRecording);
    }

    // 5. 初始化和事件监听
    initializeVoiceButton();
    
    // ... 其他代码保持不变 ...

    // 添加音频转换函数
    async function convertToWav(audioBlob) {
        return new Promise(async (resolve, reject) => {
            try {
                // 创建新的 AudioContext
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                
                // 读取音频数据
                const arrayBuffer = await audioBlob.arrayBuffer();
                
                // 解码音频数据
                audioContext.decodeAudioData(arrayBuffer, 
                    async (audioBuffer) => {
                        try {
                            // 创建新的 OfflineAudioContext
                            const offlineContext = new OfflineAudioContext(1, 
                                audioBuffer.length * (16000 / audioBuffer.sampleRate), 
                                16000
                            );

                            // 创建音频源
                const source = offlineContext.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(offlineContext.destination);
                            source.start(0);
                
                            // 渲染音频
                const renderedBuffer = await offlineContext.startRendering();
                
                // 转换为 WAV
                            const wavBuffer = audioBufferToWav(renderedBuffer);
                            const wavBlob = new Blob([wavBuffer], { type: 'audio/wav' });
                
                resolve(wavBlob);
                        } catch (error) {
                            console.error('音频渲染错误:', error);
                            reject(error);
                        }
                    },
                    (error) => {
                        console.error('音频解码错误:', error);
                        reject(error);
                    }
                );
            } catch (error) {
                console.error('音频转换错误:', error);
                reject(error);
            }
        });
    }

    // 添加 AudioBuffer 转 WAV 的辅助函数
    function audioBufferToWav(audioBuffer) {
        const numChannels = 1;
        const sampleRate = 16000;
        const format = 1; // PCM
        const bitDepth = 16;
        
        const bytesPerSample = bitDepth / 8;
        const blockAlign = numChannels * bytesPerSample;
        
        const data = audioBuffer.getChannelData(0);
        const samples = new Int16Array(data.length);
        
        // 转换浮点音频数据为16位整数
        for (let i = 0; i < data.length; i++) {
            const s = Math.max(-1, Math.min(1, data[i]));
            samples[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        
        const wavBuffer = new ArrayBuffer(44 + samples.length * 2);
        const view = new DataView(wavBuffer);
        
        // WAV文件头
        writeString(view, 0, 'RIFF');
        view.setUint32(4, 36 + samples.length * 2, true);
        writeString(view, 8, 'WAVE');
        writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, format, true);
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * blockAlign, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, bitDepth, true);
        writeString(view, 36, 'data');
        view.setUint32(40, samples.length * 2, true);
        
        // 写入采样数据
        for (let i = 0; i < samples.length; i++) {
            view.setInt16(44 + i * 2, samples[i], true);
        }
        
        return wavBuffer;
    }

    function writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }

    // 修改预加载音频的函数
    async function preloadAudio(text) {
        // 分割句子
        const sentences = text.match(/[^。！？.!?]+[。！？.!?]+/g) || [text];
        const audioResults = [];
        
        // 顺序加载音频
        for (const sentence of sentences) {
            try {
                const encodedText = encodeURIComponent(sentence);
                const url = `https://xiaoapi.cn/API/zs_tts.php?type=xunfei&msg=${encodedText}&id=3`;
                
                // 发起请求并等待完成
                const response = await fetch(url);
                const data = await response.json();
                
                if (data.code === 200) {
                    // 创建并预加载音频
                    const audio = new Audio();
                    audio.src = data.tts.replace('http://', 'https://');
                    
                    // 等待音频加载完成
                    await new Promise((resolve, reject) => {
                        audio.onloadeddata = resolve;
                        audio.onerror = reject;
                    });
                    
                    audioResults.push({
                        sentence,
                        audioUrl: audio.src,
                        audio: audio,
                        loaded: true
                    });
                } else {
                    console.error('音频合成失败:', data);
                    audioResults.push({
                        sentence,
                        loaded: false,
                        error: '音频合成失败'
                    });
                }
            } catch (error) {
                console.error('音频预加载失败:', error);
                audioResults.push({
                    sentence,
                    loaded: false,
                    error: error.message
                });
            }
        }
        
        return audioResults;
    }

    // 修改发送消息函数中的音频播放部分
    async function playAudioSequentially(audioData, messageDiv) {
        const waveform = messageDiv.querySelector('.waveform');
        
        try {
            if (audioData && audioData.loaded && audioData.audio) {
                await new Promise((resolve, reject) => {
                    const audio = audioData.audio;
                    
                    audio.onplay = () => {
                        startWaveformAnimation(waveform);
                    };
                    
                    audio.onended = () => {
                        stopWaveformAnimation(waveform);
                        resolve();
                    };
                    
                    audio.onerror = (e) => {
                        console.error('音频播放错误:', e);
                        stopWaveformAnimation(waveform);
                        reject(new Error('音频播放失败'));
                    };
                    
                    // 确保音频从头开始播放
                    audio.currentTime = 0;
                    audio.play().catch(error => {
                        console.error('音频播放失败:', error);
                        stopWaveformAnimation(waveform);
                        reject(error);
                    });
                });
            } else {
                console.warn('音频未加载成功，跳过播放');
            }
        } catch (error) {
            console.error('音频播放错误:', error);
        }
    }

    // 修改发送消息函数中的处理部分
    async function sendMessage() {
        const text = textInput.value.trim();
        if (text) {
            addMessage(text, true);
            textInput.value = '';
            
            try {
                const thinkingMessage = addMessage('', false, true);
                const shouldSearch = await checkIfNeedSearch(text);
                chatContainer.removeChild(thinkingMessage);
                
                if (!shouldSearch) {
                    const aiThinkingMessage = addMessage('', false, true);
                    const aiResponse = await callSiliconFlowAPI(text);
                    chatContainer.removeChild(aiThinkingMessage);
                    
                    // 分割句子并预加载音频
                    const sentences = aiResponse.match(/[^。！？.!?]+[。！？.!?]+/g) || [aiResponse];
                    const audioData = await preloadAudio(aiResponse);
                    
                    // 显示消息并按顺序播放音频
                    for (let i = 0; i < sentences.length; i++) {
                        const sentence = sentences[i];
                        const audioInfo = audioData[i];
                        
                        // 创建消息元素
                            const messageDiv = document.createElement('div');
                            messageDiv.className = 'message ai-message';
                            messageDiv.style.opacity = '0';

                            // 添加文本容器
                            const textContainer = document.createElement('div');
                            textContainer.className = 'text-container';
                            textContainer.textContent = sentence;

                        // 添加波形容器
                        const waveformContainer = document.createElement('div');
                        waveformContainer.className = 'waveform-container';
                            const waveform = document.createElement('div');
                            waveform.className = 'waveform';
                        for (let j = 0; j < 30; j++) {
                                const bar = document.createElement('div');
                                bar.className = 'waveform-bar';
                                waveform.appendChild(bar);
                            }

                            waveformContainer.appendChild(waveform);
                            messageDiv.appendChild(textContainer);
                            messageDiv.appendChild(waveformContainer);

                            // 显示文字
                            messageDiv.style.transition = 'opacity 0.3s ease-in';
                            messageDiv.style.opacity = '1';
                            chatContainer.appendChild(messageDiv);
                            chatContainer.scrollTop = chatContainer.scrollHeight;

                        // 等待当前音频播放完成后再播放下一个
                        await playAudioSequentially(audioInfo, messageDiv);
                    }
                }
            } catch (error) {
                console.error('Error:', error);
                addMessage('抱歉，发生错误，请稍后重试。', false);
            }
        }
    }

    // 添加事件监听
    sendBtn.addEventListener('click', sendMessage);
    textInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // 添加消息显示函数
    function addMessage(text, isUser = false, isThinking = false) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isUser ? 'user-message' : 'ai-message'}`;
        
        if (isThinking) {
            messageDiv.className += ' thinking-message';
            const dotsContainer = document.createElement('div');
            dotsContainer.className = 'thinking-dots';
            for (let i = 0; i < 3; i++) {
                const dot = document.createElement('div');
                dot.className = 'dot';
                dotsContainer.appendChild(dot);
            }
            messageDiv.appendChild(dotsContainer);
        } else {
            messageDiv.style.opacity = '0';
            messageDiv.textContent = text;
            requestAnimationFrame(() => {
                messageDiv.style.opacity = '1';
            });
        }
        
        chatContainer.appendChild(messageDiv);
        chatContainer.scrollTop = chatContainer.scrollHeight;
        
        return messageDiv;
    }

    // 添加判断是否需要搜索的函数
    async function checkIfNeedSearch(text) {
        try {
            const response = await fetch(CHAT_API_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${API_KEY}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    model: 'Qwen/Qwen2.5-Coder-7B-Instruct',
                    messages: [
                        {
                            role: 'system',
                            content: '你是一个判断助手。如果用户的问题是询问新闻、时事、实时信息相关的内容，回答"yes"，否则回答"no"。只需要回答"yes"或"no"，不要解释。'
                        },
                        {
                            role: 'user',
                            content: text
                        }
                    ],
                    temperature: 0.1,
                    max_tokens: 10
                })
            });

            if (!response.ok) {
                console.error('判断API请求失败');
                return false;
            }

            const data = await response.json();
            const result = data.choices[0].message.content.toLowerCase().trim();
            return result === 'yes';
        } catch (error) {
            console.error('判断过程出错:', error);
            return false;
        }
    }

    // 修改调用AI对话的函数
    async function callSiliconFlowAPI(text) {
        try {
            console.log('开始AI对话请求...');
            const requestBody = {
                model: 'Qwen/Qwen2.5-Coder-7B-Instruct',
                messages: [
                    {
                        role: 'system',
                        content: '你是一个友好的AI助手。'
                    },
                    {
                        role: 'user',
                        content: text
                    }
                ],
                temperature: 0.7,
                max_tokens: 2000,
                stream: false
            };

            console.log('请求数据:', requestBody);

            const response = await fetch(CHAT_API_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${API_KEY}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('AI对话错误响应:', {
                    status: response.status,
                    statusText: response.statusText,
                    headers: Object.fromEntries(response.headers.entries()),
                    error: errorText
                });
                throw new Error(`AI对话请求失败: ${response.status} - ${errorText}`);
            }

            const data = await response.json();
            console.log('AI响应数据:', data);

            if (!data.choices || !data.choices[0] || !data.choices[0].message) {
                console.error('无效的响应数据:', data);
                throw new Error('AI响应格式错误');
            }

            return data.choices[0].message.content;
        } catch (error) {
            console.error('AI对话完整错误:', {
                name: error.name,
                message: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    // 添加显示搜索结果的函数
    function displaySearchResults(results) {
        searchResults.innerHTML = '';
        
        if (results && results.length > 0) {
            results.forEach(result => {
                const resultDiv = document.createElement('div');
                resultDiv.className = 'search-result';
                
                const titleDiv = document.createElement('div');
                titleDiv.className = 'search-result-title';
                titleDiv.textContent = result.title;
                
                const contentDiv = document.createElement('div');
                contentDiv.className = 'search-result-content';
                contentDiv.textContent = result.content;
                
                const linkDiv = document.createElement('a');
                linkDiv.className = 'search-result-link';
                linkDiv.href = result.link;
                linkDiv.target = '_blank';
                linkDiv.textContent = result.media;
                
                resultDiv.appendChild(titleDiv);
                resultDiv.appendChild(contentDiv);
                resultDiv.appendChild(linkDiv);
                searchResults.appendChild(resultDiv);
            });
        } else {
            const noResultDiv = document.createElement('div');
            noResultDiv.className = 'no-results';
            noResultDiv.textContent = '未找到相关新闻';
            searchResults.appendChild(noResultDiv);
        }
    }

    // 添加波形动画控制函数
    function startWaveformAnimation(waveform) {
        const bars = waveform.querySelectorAll('.waveform-bar');
        bars.forEach(bar => {
            const height = Math.random() * 100;
            bar.style.height = `${height}%`;
            bar.style.animationDuration = `${Math.random() * 0.5 + 0.5}s`;
        });
    }

    function stopWaveformAnimation(waveform) {
        const bars = waveform.querySelectorAll('.waveform-bar');
        bars.forEach(bar => {
            bar.style.height = '10%';
            bar.style.animationDuration = '0s';
        });
    }
}); 