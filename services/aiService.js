const fs = require('fs').promises; // Gunakan versi promise dari fs
const { GoogleGenerativeAI } = require('@google/generative-ai');

// --- Google AI (Gemini) Configuration ---
if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not set in the .env file. Please obtain a key from Google AI Studio.');
}

// Pastikan .env sudah dimuat di file utama (server.js)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Helper function to convert file to a generative part
async function fileToGenerativePart(filePath, mimeType) {
    try {
        const fileBuffer = await fs.readFile(filePath);
        return {
            inlineData: {
                data: fileBuffer.toString("base64"),
                mimeType
            },
        };
    } catch (error) {
        console.error("Error reading file for AI service:", error);
        return null;
    }
}

/**
 * Gets a response from the AI Stylist (Gemini).
 * @param {string} [message] - The text message from the user.
 * @param {object} [imageFile] - The uploaded image file object from multer.
 * @param {boolean} isSubscribed - The subscription status of the user.
 * @returns {Promise<string>} The AI's text response.
 */
async function getAiStylistResponse(message, imageFile, isSubscribed = false) {
    const modelConfig = {
        temperature: 0.4,
        topK: 32,
        topP: 1,
        maxOutputTokens: 4096,
    };
    
    // System prompt untuk pengguna gratis (terbatas)
    const freeUserSystemPrompt = `Anda adalah "AI Stylist" dari BarberLux, seorang ahli penata gaya rambut virtual yang ramah dan profesional.
    
Tugas utama Anda adalah menjawab pertanyaan yang HANYA berhubungan dengan:
- Gaya rambut pria
- Rekomendasi potong rambut
- Perawatan jenggot dan kumis
- Analisis bentuk wajah untuk rekomendasi rambut
    
Jika pengguna bertanya tentang topik lain di luar itu (misalnya, cuaca, politik, resep masakan, kode program, dll.), JANGAN DIJAWAB. Sebaliknya, berikan respons sopan berikut ini, dan HANYA respons ini:
    
"Untuk bertanya tentang topik apa pun di luar gaya rambut, Anda perlu upgrade ke akun Premium. Dengan akun Premium, Anda bisa chat sepuasnya tentang topik apa saja! [UPGRADE_CTA]"
    
Ketika diberi gambar wajah, analisis bentuk wajah dan berikan 2-3 rekomendasi gaya rambut yang cocok. Jelaskan mengapa setiap gaya itu cocok.
    
Gunakan selalu format Markdown untuk keterbacaan yang baik.`;
    
    // System prompt untuk pengguna premium (tanpa batas)
    const premiumUserSystemPrompt = `Anda adalah asisten AI premium dari BarberLux. Anda adalah seorang generalis yang sangat cerdas dan dapat menjawab pertanyaan tentang topik apa pun dengan ramah dan profesional. Berikan jawaban yang informatif dan bermanfaat. Jawab selalu dalam format Markdown untuk keterbacaan yang baik.`;
    
    // Pilih prompt berdasarkan status langganan
    const systemInstruction = isSubscribed ? premiumUserSystemPrompt : freeUserSystemPrompt;

    // Use a single, modern multimodal model for all requests.
    // gemini-1.5-flash-latest can handle both text and vision.
    const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash-latest", // atau model lain yang mendukung system instruction
        systemInstruction: systemInstruction,
        generationConfig: modelConfig
    });

    const promptParts = [];

    // Add the user's text message to the prompt parts
    promptParts.push(message || "Tolong analisis wajah saya dari gambar ini.");

    // If an image file exists, convert it and add it to the prompt parts
    if (imageFile) {
        const imagePart = await fileToGenerativePart(imageFile.path, imageFile.mimetype);
        if (!imagePart) {
            throw new Error("Gagal memproses gambar yang diunggah.");
        }
        promptParts.push(imagePart);
    }

    const result = await model.generateContent(promptParts);
    const responseText = result.response.text();

    if (!responseText) {
        return "Maaf, saya tidak dapat memproses permintaan tersebut saat ini. Coba ajukan pertanyaan dengan cara yang berbeda.";
    }
    return responseText;
}

module.exports = { getAiStylistResponse };