// ========== TRIVIA DATA MANAGEMENT ==========

/**
 * Load tất cả câu hỏi từ Supabase
 */
async function loadTriviaQuestions() {
    if (!window.app.supabase) return [];
    try {
        const { data, error } = await window.app.supabase
            .from('trivia_questions')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data || [];
    } catch (err) {
        console.error('❌ Error loading trivia questions:', err);
        return [];
    }
}

/**
 * Load tất cả câu trả lời của một user
 */
async function loadTriviaResponsesByUser(userId) {
    if (!window.app.supabase) return [];
    try {
        const { data, error } = await window.app.supabase
            .from('trivia_responses')
            .select('*')
            .eq('user_id', userId);

        if (error) throw error;
        return data || [];
    } catch (err) {
        console.error('❌ Error loading user trivia responses:', err);
        return [];
    }
}

/**
 * Load tất cả câu trả lời của một câu hỏi (for admin)
 */
async function loadTriviaResponsesByQuestion(questionId) {
    if (!window.app.supabase) return [];
    try {
        const { data, error } = await window.app.supabase
            .from('trivia_responses')
            .select('*')
            .eq('question_id', questionId);

        if (error) throw error;
        return data || [];
    } catch (err) {
        console.error('❌ Error loading question responses:', err);
        return [];
    }
}

// ========== PLAYER FUNCTIONS ==========

/**
 * Render danh sách trivia cho player
 */
async function renderPlayerTriviaList() {
    const container = document.getElementById('player-trivia-questions-container');
    if (!container) {
        console.warn('⚠️ Container not found: player-trivia-questions-container');
        return;
    }

    // Validate currentUserId
    if (!window.app.currentUserId) {
        console.warn('⚠️ currentUserId not set');
        container.innerHTML = `<p class="text-sm text-stone-500 italic text-center py-8">Lỗi: Không xác định được người chơi.</p>`;
        return;
    }

    // Load dữ liệu
    const questions = await loadTriviaQuestions();
    const responses = await loadTriviaResponsesByUser(window.app.currentUserId);

    // Tạo map quyết nhanh
    const responseMap = {};
    responses.forEach(r => {
        responseMap[r.question_id] = r;
    });

    if (questions.length === 0) {
        container.innerHTML = `<p class="text-sm text-stone-500 italic text-center py-8">Chưa có câu hỏi nào từ Admin.</p>`;
        return;
    }

    // Sắp xếp: chưa trả lời lên trước
    const unansweredQuestions = questions.filter(q => !responseMap[q.id]);
    const answeredQuestions = questions.filter(q => responseMap[q.id]);
    const sortedQuestions = [...unansweredQuestions, ...answeredQuestions];

    container.innerHTML = sortedQuestions.map((q, index) => {
        const response = responseMap[q.id];
        const isAnswered = !!response;
        const isCorrect = response?.is_marked_correct;
        // Fix: Use response answered_at instead of question created_at
        const displayDate = isAnswered 
            ? new Date(response.answered_at).toLocaleDateString('vi-VN')
            : new Date(q.created_at).toLocaleDateString('vi-VN');

        let statusBadge = '';
        let inputClass = 'bg-stone-950 border border-stone-800 text-white';
        let inputDisabled = false;

        if (isAnswered) {
            inputDisabled = true;
            if (isCorrect) {
                statusBadge = `<span class="inline-block ml-2 text-green-400 font-bold text-lg">✓</span>`;
                inputClass = 'bg-stone-950 border border-stone-700 text-stone-500';
            } else {
                statusBadge = `<span class="inline-block ml-2 text-stone-500 text-xs">Đã trả lời</span>`;
                inputClass = 'bg-stone-950 border border-stone-700 text-stone-500';
            }
        }

        return `
            <div class="bg-stone-950/60 border border-stone-900 rounded-2xl p-5 space-y-3">
                <div class="flex justify-between items-start">
                    <div class="flex-1">
                        <p class="text-xs text-stone-500 font-bold">Câu ${index + 1}</p>
                        <p class="text-sm font-bold text-white mt-1">${escapeHtml(q.question)}</p>
                        <p class="text-10px text-stone-600 mt-2">Thêm: ${displayDate}</p>
                    </div>
                    ${statusBadge}
                </div>
                <input 
                    type="text" 
                    id="trivia-answer-${q.id}" 
                    value="${response?.user_answer || ''}"
                    placeholder="Nhập câu trả lời của bạn..."
                    ${inputDisabled ? 'disabled' : `onchange="executeSubmitTriviaAnswer(${q.id})"`}
                    class="w-full ${inputClass} px-4 py-3 rounded-xl focus:outline-none ${inputDisabled ? 'cursor-not-allowed opacity-75' : 'focus:border-emerald-600'} text-sm font-medium"
                >
            </div>
        `;
    }).join('');
}

/**
 * Submit câu trả lời trivia từ player
 */
async function executeSubmitTriviaAnswer(questionId) {
    const answerField = document.getElementById(`trivia-answer-${questionId}`);
    const answer = answerField?.value.trim();

    if (!answer) {
        alert('Vui lòng nhập câu trả lời');
        return;
    }

    // Validate currentUserId
    if (!window.app.currentUserId) {
        alert('Lỗi: Không xác định được người chơi. Vui lòng đăng nhập lại.');
        return;
    }

    try {
        // Check if already answered
        const { data: existing } = await window.app.supabase
            .from('trivia_responses')
            .select('*')
            .eq('user_id', window.app.currentUserId)
            .eq('question_id', questionId);

        if (existing && existing.length > 0) {
            alert('Bạn đã trả lời câu này rồi!');
            answerField.disabled = true;
            renderPlayerTriviaList();
            return;
        }

        // Insert answer
        const { data, error } = await window.app.supabase
            .from('trivia_responses')
            .insert({
                user_id: window.app.currentUserId,
                question_id: questionId,
                user_answer: answer,
                is_marked_correct: false,
                point_awarded: 0,
                answered_at: new Date().toISOString()
            })
            .select();

        if (error) {
            // Handle UNIQUE constraint violation
            if (error.code === '23505' || error.message.includes('duplicate')) {
                alert('Bạn đã trả lời câu này rồi! Vui lòng tải lại trang.');
                answerField.disabled = true;
            } else {
                throw error;
            }
            return;
        }

        console.log('✅ Answer submitted:', data);
        renderPlayerTriviaList();
    } catch (err) {
        console.error('❌ Error submitting answer:', err);
        alert('Lỗi khi gửi câu trả lời: ' + (err.message || 'Vui lòng thử lại'));
    }
}

// ========== ADMIN FUNCTIONS ==========

/**
 * Render panel admin quản lý trivia
 */
async function renderAdminTriviaPanel() {
    const container = document.getElementById('admin-trivia-section');
    if (!container) {
        console.warn('⚠️ Container not found: admin-trivia-section');
        return;
    }

    const questions = await loadTriviaQuestions();

    let questionsHtml = '';
    if (questions.length === 0) {
        questionsHtml = `<p class="text-xs text-stone-500 italic text-center py-4">Chưa có câu hỏi nào. Hãy thêm mới ở trên!</p>`;
    } else {
        questionsHtml = questions.map((q, idx) => `
            <div class="bg-stone-900/40 p-3 rounded-xl border border-stone-800 flex justify-between items-start">
                <div class="flex-1">
                    <p class="text-10px text-stone-500">Câu ${idx + 1}</p>
                    <p class="text-sm font-bold text-white mt-1">${q.question}</p>
                    <p class="text-10px text-stone-600 mt-1">${new Date(q.created_at).toLocaleDateString('vi-VN')}</p>
                </div>
                <button onclick="executeShowTriviaResponses(${q.id})" class="ml-2 px-3 py-1.5 bg-blue-600 text-white rounded text-10px font-bold whitespace-nowrap hover:bg-blue-500" data-question="${escapeHtml(q.question)}">
                    Xem Đáp Án
                </button>
            </div>
        `).join('');
    }

    container.innerHTML = `
        <div class="space-y-4">
            <div class="bg-stone-950/60 border border-stone-900 rounded-2xl p-5 space-y-4">
                <label class="text-xs font-bold text-stone-400 uppercase">Thêm Câu Hỏi Mới</label>
                <textarea 
                    id="admin-trivia-question-input" 
                    rows="2" 
                    placeholder="Nhập câu hỏi..."
                    class="w-full bg-stone-900 text-white p-3 rounded-xl focus:outline-none focus:border-emerald-600 border border-stone-800 text-sm"
                ></textarea>
                <button onclick="executeAddNewTriviaQuestion()" class="w-full bg-emerald-600 text-stone-950 font-black py-2.5 rounded-xl uppercase tracking-wider text-sm hover:bg-emerald-500">
                    + Thêm Câu Hỏi
                </button>
            </div>

            <div class="bg-stone-950/60 border border-stone-900 rounded-2xl p-5 space-y-4">
                <label class="text-xs font-bold text-stone-400 uppercase">Danh Sách Câu Hỏi</label>
                <div id="admin-trivia-questions-list" class="space-y-2">
                    ${questionsHtml}
                </div>
            </div>
        </div>
    `;
}

/**
 * Thêm câu hỏi mới
 */
async function executeAddNewTriviaQuestion() {
    const input = document.getElementById('admin-trivia-question-input');
    const question = input?.value.trim();

    if (!question) {
        alert('Vui lòng nhập câu hỏi');
        return;
    }

    try {
        const { data, error } = await window.app.supabase
            .from('trivia_questions')
            .insert({
                question: question,
                created_at: new Date().toISOString()
            })
            .select();

        if (error) throw error;

        console.log('✅ Question added:', data);
        input.value = '';
        renderAdminTriviaPanel();
    } catch (err) {
        console.error('❌ Error adding question:', err);
        alert('Lỗi khi thêm câu hỏi: ' + err.message);
    }
}

/**
 * Hiển thị danh sách câu trả lời cho một câu hỏi
 */
async function executeShowTriviaResponses(questionId) {
    const container = document.getElementById('admin-trivia-responses-container');
    if (!container) {
        console.warn('⚠️ Container not found: admin-trivia-responses-container');
        return;
    }

    // Find the button to get the question text
    const button = document.querySelector(`button[onclick*="executeShowTriviaResponses(${questionId})"]`);
    const questionText = button?.getAttribute('data-question') || 'Câu hỏi';

    try {
        const { data: responses, error } = await window.app.supabase
            .from('trivia_responses')
            .select('*, users:user_id(username)')
            .eq('question_id', questionId)
            .order('answered_at', { ascending: true });

        if (error) throw error;

        // Lấy danh sách tất cả users
        const { data: allUsers } = await window.app.supabase
            .from('users')
            .select('id, username');

        const respondedUserIds = new Set(responses?.map(r => r.user_id) || []);
        const notRespondedUsers = allUsers?.filter(u => !respondedUserIds.has(u.id)) || [];

        if (!responses || responses.length === 0) {
            container.innerHTML = `
                <div class="bg-stone-950/60 border border-stone-900 rounded-2xl p-5">
                    <h3 class="text-sm font-black text-white uppercase mb-4">Câu: ${questionText}</h3>
                    <p class="text-sm text-stone-500 italic">Chưa ai trả lời câu này</p>
                    ${notRespondedUsers.length > 0 ? `
                        <div class="mt-4 space-y-1">
                            <p class="text-xs font-bold text-stone-400 uppercase">Chưa trả lời:</p>
                            ${notRespondedUsers.map(u => `<p class="text-xs text-stone-500">- ${escapeHtml(u.username)}</p>`).join('')}
                        </div>
                    ` : ''}
                </div>
            `;
            return;
        }

        const responseRows = (responses || []).map(r => `
            <tr class="border-b border-stone-900/40 hover:bg-stone-900/30">
                <td class="p-3 text-sm font-bold text-white">${escapeHtml(r.users?.username || 'Unknown')}</td>
                <td class="p-3 text-sm text-stone-300">${escapeHtml(r.user_answer || '')}</td>
                <td class="p-3 text-center">
                    <input 
                        type="checkbox" 
                        ${r.is_marked_correct ? 'checked' : ''}
                        onchange="executeMarkTriviaAnswerCorrect(${r.id}, this.checked)"
                        class="w-4 h-4 cursor-pointer accent-green-500"
                    >
                </td>
                <td class="p-3 text-center">
                    <span class="${r.is_marked_correct ? 'text-green-400 font-bold' : 'text-stone-500'}">
                        ${r.is_marked_correct ? '✓ +1đ' : '--'}
                    </span>
                </td>
            </tr>
        `).join('');

        container.innerHTML = `
            <div class="bg-stone-950/60 border border-stone-900 rounded-2xl p-5 space-y-4">
                <h3 class="text-sm font-black text-white uppercase">Câu: ${escapeHtml(questionText)}</h3>
                
                <table class="w-full text-left text-xs">
                    <thead>
                        <tr class="text-10px text-stone-500 uppercase border-b border-stone-900">
                            <th class="p-3">Người Chơi</th>
                            <th class="p-3">Câu Trả Lời</th>
                            <th class="p-3 text-center">Tích Đúng</th>
                            <th class="p-3 text-center">Điểm</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${responseRows}
                    </tbody>
                </table>

                ${notRespondedUsers.length > 0 ? `
                    <div class="mt-4 pt-4 border-t border-stone-900">
                        <p class="text-10px font-bold text-stone-400 uppercase mb-2">Chưa trả lời (${notRespondedUsers.length})</p>
                        <div class="flex flex-wrap gap-2">
                            ${notRespondedUsers.map(u => `<span class="text-10px bg-stone-900 text-stone-400 px-2 py-1 rounded">${escapeHtml(u.username)}</span>`).join('')}
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    } catch (err) {
        console.error('❌ Error loading responses:', err);
        alert('Lỗi khi tải câu trả lời: ' + err.message);
    }
}

/**
 * Tích/bỏ tích câu trả lời là đúng
 */
async function executeMarkTriviaAnswerCorrect(responseId, isCorrect) {
    try {
        const pointAwarded = isCorrect ? 1 : 0;
        const { error } = await window.app.supabase
            .from('trivia_responses')
            .update({
                is_marked_correct: isCorrect,
                point_awarded: pointAwarded,
                marked_at: new Date().toISOString()
            })
            .eq('id', responseId);

        if (error) throw error;

        // Update bonus_points của user
        const { data: response } = await window.app.supabase
            .from('trivia_responses')
            .select('user_id')
            .eq('id', responseId)
            .single();

        if (response) {
            await updateUserBonusPoints(response.user_id);
        }

        console.log(`✅ Answer marked as ${isCorrect ? 'correct' : 'incorrect'}`);
    } catch (err) {
        console.error('❌ Error marking answer:', err);
        alert('Lỗi khi cập nhật: ' + err.message);
    }
}

/**
 * Cập nhật bonus_points cho user dựa trên trivia_responses
 */
async function updateUserBonusPoints(userId) {
    try {
        // Validate userId
        if (!userId) {
            console.warn('⚠️ userId is required for updateUserBonusPoints');
            return;
        }

        // Tính tổng điểm từ trivia_responses
        const { data: responses, error: respError } = await window.app.supabase
            .from('trivia_responses')
            .select('point_awarded')
            .eq('user_id', userId)
            .eq('is_marked_correct', true);

        if (respError) throw respError;

        const totalBonus = (responses || []).reduce((sum, r) => sum + (r.point_awarded || 0), 0);

        // Update users table
        const { error: updateError } = await window.app.supabase
            .from('users')
            .update({ bonus_points: totalBonus })
            .eq('id', userId);

        if (updateError) throw updateError;

        console.log(`✅ Bonus points updated for user ${userId}: ${totalBonus}`);

        // Cập nhật local cache
        if (window.app.profileDatabase) {
            const user = window.app.profileDatabase.find(p => p.id === userId);
            if (user) {
                user.bonusPoints = totalBonus;
            }
        }

        executeDynamicScoringEngine();
        executeRenderSequence();
    } catch (err) {
        console.error('❌ Error updating bonus points:', err);
    }
}

/**
 * Switch trivia tab (khi bấm nút Trivia)
 */
async function executeSwitchToTrivia() {
    executeSwitchTab('trivia');
    if (window.app.currentSystemRole === 'player') {
        await renderPlayerTriviaList();
    }
}

/**
 * Helper function: Escape HTML để chống XSS
 */
function escapeHtml(text) {
    if (!text) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

/**
 * Render trivia admin panel khi admin login
 */
async function initAdminTriviaPanel() {
    if (window.app.currentSystemRole === 'admin') {
        // Tạo container nếu chưa có
        const adminPanel = document.getElementById('admin-trivia-section');
        if (adminPanel) {
            await renderAdminTriviaPanel();
        }
    }
}
