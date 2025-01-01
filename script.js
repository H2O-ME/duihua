document.addEventListener('DOMContentLoaded', function() {
    const chatContainer = document.getElementById('chatContainer');
    const textInput = document.getElementById('textInput');
    const sendBtn = document.getElementById('sendBtn');
    const startVoiceBtn = document.getElementById('startVoice');
    const stopVoiceBtn = document.getElementById('stopVoice');

    let recognition = null;
    if ('webkitSpeechRecognition' in window) {
        recognition = new webkitSpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'zh-CN';
    }

    const API_KEY = 'sk-hyeudoewxhrzksdcsfbyzkprbocvedmdhydzzmmpuohxxphs';
    const API_BASE_URL = 'https://api.siliconflow.cn/v1';
    const CHAT_API_URL = 'https://api.siliconflow.cn/chat/completions';

    // 添加对话历史记录数组
    let conversationHistory = [];
    // 添加下一句请求的计时器
    let nextSentenceTimer = null;

    // 添加消息到聊天界面
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
            // 添加文字渐显动画
            messageDiv.style.opacity = '0';
            messageDiv.textContent = text;
            requestAnimationFrame(() => {
                messageDiv.style.opacity = '1';
            });
        }
        
        chatContainer.appendChild(messageDiv);
        chatContainer.scrollTop = chatContainer.scrollHeight;
        
        // 添加入场动画类
        requestAnimationFrame(() => {
            messageDiv.classList.add('animate-in');
        });
        
        return messageDiv;
    }

    // 调用硅基流动API
    async function callSiliconFlowAPI(userInput) {
        // 构建消息历史
        const messages = [
            {
                role: "system",
                content: "用人类自然平和轻松幽默的语言与我对话。你的回答应该亲切、友好，同时保持专业和帮助性。避免使用过于正式或技术性的语言，你可以使用俗语或一些网络梗，确保我们的交流流畅且舒适。"
            },
            ...conversationHistory,
            {
                role: "user",
                content: userInput
            }
        ];

        const requestBody = {
            model: "Qwen/Qwen2.5-Coder-7B-Instruct",
            messages: messages,
            temperature: 0.8,
            max_tokens: 2048,
            top_p: 0.9,
            presence_penalty: 0.6,
            frequency_penalty: 0.3
        };

        try {
            const response = await fetch(CHAT_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${API_KEY}`
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const errorMessage = errorData.error?.message || `API请求失败: ${response.status}`;
                addMessage(`对话错误: ${errorMessage}`, false);
                throw new Error(errorMessage);
            }

            const data = await response.json();
            const aiResponse = data.choices[0].message.content;
            
            // 更新对话历史
            conversationHistory.push({ role: "user", content: userInput });
            conversationHistory.push({ role: "assistant", content: aiResponse });
            
            // 保持对话历史在合理范围内（最近10轮对话）
            if (conversationHistory.length > 20) {
                conversationHistory = conversationHistory.slice(-20);
            }

            return aiResponse;
        } catch (error) {
            console.error('API调用错误:', error);
            addMessage(`对话失败: ${error.message}`, false);
            throw error;
        }
    }

    // 修改文本转语音功能
    async function textToSpeech(text, maxRetries = 3) {
        let retryCount = 0;
        
        async function tryRequest() {
            try {
                const encodedText = encodeURIComponent(text);
                const url = `https://xiaoapi.cn/API/zs_tts.php?type=xunfei&msg=${encodedText}&id=3`;

                const response = await fetch(url);
                
                // 检查状态码
                if (![200, 206, 307].includes(response.status)) {
                    throw new Error(`TTS API状态码异常: ${response.status}`);
                }

                const data = await response.json();
                
                if (data.code !== 200) {
                    throw new Error(`语音合成失败: ${data.msg}`);
                }

                // 验证音频URL时使用no-cors模式
                const audioCheck = await fetch(data.tts, { mode: 'no-cors' });

                // 使用返回的MP3链接播放音频，添加代理服务
                const proxyUrl = data.tts.replace('http://', 'https://');
                await playAudio(proxyUrl);
                
            } catch (error) {
                console.error(`TTS尝试 ${retryCount + 1}/${maxRetries} 失败:`, error);
                
                if (retryCount < maxRetries - 1) {
                    retryCount++;
                    addMessage(`语音合成重试中 (${retryCount}/${maxRetries})...`, false);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    return tryRequest();
                } else {
                    addMessage(`语音合成失败: ${error.message}`, false);
                    throw error;
                }
            }
        }

        return tryRequest();
    }

    // 修改语音转文本功能
    async function speechToText(audioBlob) {
        const formData = new FormData();
        const file = new File([audioBlob], "audio.wav", { type: "audio/wav" });
        formData.append('file', file);
        formData.append('model', 'FunAudioLLM/SenseVoiceSmall');
        formData.append('language', 'zh');
        formData.append('response_format', 'json');

        try {
            addMessage('正在识别语音...', false);
            const response = await fetch(`${API_BASE_URL}/audio/transcriptions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${API_KEY}`
                },
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const errorMessage = errorData.error?.message || `语音识别请求失败: ${response.status}`;
                addMessage(`语音识别错误: ${errorMessage}`, false);
                throw new Error(errorMessage);
            }

            const data = await response.json();
            if (!data.text) {
                const errorMessage = '未能识别到有效的语音内容';
                addMessage(errorMessage, false);
                throw new Error(errorMessage);
            }
            addMessage(`语音识别结果: ${data.text}`, false);
            return data.text;
        } catch (error) {
            console.error('语音识别错误:', error);
            addMessage(`语音识别失败: ${error.message}`, false);
            throw error;
        }
    }

    // 修改发送消息函数，实现文字和音频同步
    async function sendMessage() {
        const text = textInput.value.trim();
        if (text) {
            addMessage(text, true);
            textInput.value = '';
            
            try {
                const thinkingMessage = addMessage('', false, true);
                const aiResponse = await callSiliconFlowAPI(text);
                chatContainer.removeChild(thinkingMessage);
                
                // 将AI响应按句子分割
                const sentences = aiResponse.match(/[^。！？.!?]+[。！？.!?]+/g) || [aiResponse];
                
                // 逐句处理
                for (const sentence of sentences) {
                    try {
                        // 创建新的消息元素
                        const messageDiv = document.createElement('div');
                        messageDiv.className = 'message ai-message';
                        messageDiv.style.opacity = '0';
                        messageDiv.textContent = sentence;
                        chatContainer.appendChild(messageDiv);

                        // 尝试获取并播放语音
                        let audioUrl = null;
                        let retryCount = 0;
                        const maxRetries = 3;

                        while (retryCount < maxRetries && !audioUrl) {
                            try {
                                const encodedText = encodeURIComponent(sentence);
                                const url = `https://xiaoapi.cn/API/zs_tts.php?type=xunfei&msg=${encodedText}&id=3`;
                                
                                const response = await fetch(url);
                                
                                if (![200, 206, 307].includes(response.status)) {
                                    throw new Error(`TTS API状态码异常: ${response.status}`);
                                }

                                const data = await response.json();
                                
                                if (data.code !== 200) {
                                    throw new Error(`语音合成失败: ${data.msg}`);
                                }

                                // 使用no-cors模式验证音频URL
                                await fetch(data.tts, { mode: 'no-cors' });
                                
                                // 使用https链接
                                audioUrl = data.tts.replace('http://', 'https://');
                                break;
                                
                            } catch (error) {
                                retryCount++;
                                if (retryCount < maxRetries) {
                                    console.error(`语音合成重试 ${retryCount}/${maxRetries}:`, error);
                                    await new Promise(resolve => setTimeout(resolve, 1000));
                                } else {
                                    throw error;
                                }
                            }
                        }

                        if (audioUrl) {
                            // 显示文字
                            messageDiv.style.transition = 'opacity 0.3s ease-in';
                            messageDiv.style.opacity = '1';
                            chatContainer.scrollTop = chatContainer.scrollHeight;

                            // 播放音频
                            const audio = new Audio(audioUrl);
                            await new Promise((resolve, reject) => {
                                audio.onended = resolve;
                                audio.onerror = reject;
                                audio.play().catch(reject);
                            });
                        } else {
                            throw new Error('无法获取有效的音频URL');
                        }
                        
                    } catch (error) {
                        console.error('句子处理错误:', error);
                        addMessage(`处理失败: ${error.message}`, false);
                    }
                }
                
            } catch (error) {
                console.error('Error:', error);
                if (thinkingMessage && thinkingMessage.parentNode) {
                    chatContainer.removeChild(thinkingMessage);
                }
                addMessage('抱歉，发生错误，请稍后重试。');
            }
        }
    }

    // 修改播放音频函数，添加事件处理
    function playAudio(audioUrl) {
        return new Promise((resolve, reject) => {
            const audio = new Audio();
            
            audio.crossOrigin = "anonymous";  // 添加跨域支持
            
            audio.oncanplaythrough = () => {
                audio.play().catch(reject);
            };
            
            audio.onended = () => {
                resolve();
            };
            
            audio.onerror = (error) => {
                console.error('音频播放错误:', error);
                reject(error);
            };

            // 设置音频源
            audio.src = audioUrl;
            
            // 开始加载
            audio.load();
        });
    }

    // 修改录音相关代码
    let mediaRecorder = null;
    let audioChunks = [];

    // 修改开始录音函数
    function startVoiceRecognition() {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            navigator.mediaDevices.getUserMedia({ 
                audio: {
                    channelCount: 1,
                    sampleRate: { ideal: 16000 },
                    echoCancellation: true,
                    noiseSuppression: true
                }
            })
            .then(stream => {
                try {
                    mediaRecorder = new MediaRecorder(stream, {
                        mimeType: 'audio/webm;codecs=opus',
                        audioBitsPerSecond: 16000
                    });
                    
                    audioChunks = [];
                    
                    mediaRecorder.ondataavailable = (event) => {
                        if (event.data.size > 0) {
                            audioChunks.push(event.data);
                        }
                    };

                    mediaRecorder.onerror = (event) => {
                        console.error('录音错误:', event.error);
                        addMessage(`录音出错: ${event.error.name} - ${event.error.message}`, false);
                        stopVoiceRecognition();
                    };

                    mediaRecorder.onstart = () => {
                        addMessage('开始录音...', false);
                        startVoiceBtn.disabled = true;
                        stopVoiceBtn.disabled = false;
                        document.querySelector('.circle-background').classList.add('recording');
                    };

                    mediaRecorder.onstop = async () => {
                        addMessage('录音结束，正在处理...', false);
                        try {
                            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                            addMessage('正在转换音频格式...', false);
                            const wavBlob = await convertToWav(audioBlob);
                            const transcribedText = await speechToText(wavBlob);
                            textInput.value = transcribedText;
                            
                            // 自动发送识别的文本
                            await sendMessage();
                            
                            // 清理录音状态
                            document.querySelector('.circle-background').classList.remove('recording');
                            startVoiceBtn.disabled = false;
                            stopVoiceBtn.disabled = true;
                        } catch (error) {
                            console.error('语音处理错误:', error);
                            addMessage(`语音处理失败: ${error.message}`, false);
                            
                            // 确保状态重置
                            document.querySelector('.circle-background').classList.remove('recording');
                            startVoiceBtn.disabled = false;
                            stopVoiceBtn.disabled = true;
                        }
                    };
                    
                    mediaRecorder.start(100);
                } catch (error) {
                    console.error('初始化录音失败:', error);
                    addMessage(`初始化录音失败: ${error.name} - ${error.message}`, false);
                    throw error;
                }
            })
            .catch(error => {
                console.error('获取麦克风失败:', error);
                let errorMsg = '无法访问麦克风';
                if (error.name === 'NotAllowedError') {
                    errorMsg = '麦克风访问被拒绝，请确保已授予麦克风访问权限';
                } else if (error.name === 'NotFoundError') {
                    errorMsg = '未找到麦克风设备';
                } else if (error.name === 'NotReadableError') {
                    errorMsg = '麦克风设备正在被其他应用程序使用';
                }
                addMessage(`${errorMsg}: ${error.name} - ${error.message}`, false);
                alert(errorMsg);
            });
        } else {
            const errorMessage = '您的浏览器不支持语音识别功能';
            addMessage(errorMessage, false);
            alert(errorMessage);
        }
    }

    // 停止录音
    function stopVoiceRecognition() {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
            mediaRecorder.stream.getTracks().forEach(track => track.stop());
            startVoiceBtn.disabled = false;
            stopVoiceBtn.disabled = true;
            document.querySelector('.circle-background').classList.remove('recording');
        }
    }

    // 修改音频格式转换函数的错误处理
    async function convertToWav(webmBlob) {
        return new Promise(async (resolve, reject) => {
            try {
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                const arrayBuffer = await webmBlob.arrayBuffer();
                
                const audioBuffer = await new Promise((decodeResolve, decodeReject) => {
                    audioContext.decodeAudioData(
                        arrayBuffer,
                        buffer => decodeResolve(buffer),
                        error => {
                            const errorMsg = '音频解码失败: ' + (error?.message || '未知错误');
                            addMessage(errorMsg, false);
                            decodeReject(new Error(errorMsg));
                        }
                    );
                });
                
                // 创建离线上下文
                const offlineContext = new OfflineAudioContext({
                    numberOfChannels: 1,
                    length: Math.ceil(audioBuffer.duration * 16000),
                    sampleRate: 16000
                });
                
                const source = offlineContext.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(offlineContext.destination);
                
                // 开始渲染
                source.start(0);
                const renderedBuffer = await offlineContext.startRendering();
                
                // 转换为 WAV
                const wavData = audioBufferToWav(renderedBuffer);
                const wavBlob = new Blob([wavData], { type: 'audio/wav' });
                
                resolve(wavBlob);
            } catch (error) {
                console.error('音频转换错误:', error);
                addMessage(`音频转换失败: ${error.message}`, false);
                reject(error);
            }
        });
    }

    // 添加 AudioBuffer 转 WAV 的辅助函数
    function audioBufferToWav(audioBuffer) {
        const numChannels = audioBuffer.numberOfChannels;
        const sampleRate = audioBuffer.sampleRate;
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

    // 事件监听
    sendBtn.addEventListener('click', sendMessage);
    
    textInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    startVoiceBtn.addEventListener('click', startVoiceRecognition);
    stopVoiceBtn.addEventListener('click', stopVoiceRecognition);

    if (recognition) {
        recognition.onresult = async function(event) {
            const result = event.results[event.results.length - 1];
            if (result.isFinal) {
                textInput.value = result[0].transcript;
                // 自动发送识别的文本
                await sendMessage();
            }
        };

        recognition.onerror = function(event) {
            console.error('语音识别错误:', event.error);
            addMessage(`语音识别错误: ${event.error.message}`, false);
            stopVoiceRecognition();
        };
    }

    // 初始化时禁用停止按钮
    stopVoiceBtn.disabled = true;

    // 合并所有动画样式
    const animationStyles = document.createElement('style');
    animationStyles.textContent = `
        .message {
            transition: opacity 0.3s ease-in;
        }
        
        .message.ai-message {
            opacity: 0;
        }
        
        .message.ai-message.show {
            opacity: 1;
        }

        .ripple {
            position: absolute;
            background: rgba(255, 255, 255, 0.7);
            border-radius: 50%;
            transform: scale(0);
            animation: rippleEffect 0.6s linear;
            pointer-events: none;
        }

        @keyframes rippleEffect {
            to {
                transform: scale(4);
                opacity: 0;
            }
        }

        .animate-in {
            animation: slideIn 0.3s ease-out forwards;
        }

        @keyframes slideIn {
            from {
                transform: translateY(20px);
                opacity: 0;
            }
            to {
                transform: translateY(0);
                opacity: 1;
            }
        }
    `;
    document.head.appendChild(animationStyles);

    // 添加按钮点击效果
    function addButtonEffects() {
        const buttons = document.querySelectorAll('button');
        buttons.forEach(button => {
            button.addEventListener('click', function(e) {
                const rect = button.getBoundingClientRect();
                const ripple = document.createElement('div');
                ripple.className = 'ripple';
                ripple.style.left = `${e.clientX - rect.left}px`;
                ripple.style.top = `${e.clientY - rect.top}px`;
                button.appendChild(ripple);
                
                setTimeout(() => {
                    ripple.remove();
                }, 1000);
            });
        });
    }

    addButtonEffects();
}); 