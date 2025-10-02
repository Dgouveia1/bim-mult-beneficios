import { _supabase } from './supabase.js';
import { getCurrentUserProfile } from './auth.js';

/**
 * Registra uma ação do usuário no banco de dados.
 * A função opera silenciosamente, registrando erros no console sem interromper o usuário.
 *
 * @param {string} action - O tipo de ação realizada (ex: 'CREATE_CLIENT', 'USER_LOGIN').
 * @param {object} [details={}] - Um objeto com detalhes relevantes sobre a ação (ex: { clientId: 123, clientName: 'João' }).
 */
export async function logAction(action, details = {}) {
    try {
        const userProfile = getCurrentUserProfile();

        // Se não houver um usuário logado, não registra a ação.
        if (!userProfile || !userProfile.id) {
            console.warn('Tentativa de log sem usuário autenticado.', { action, details });
            return;
        }

        const logEntry = {
            user_id: userProfile.id,
            user_email: userProfile.email,
            action: action,
            details: details
        };

        const { error } = await _supabase.from('action_logs').insert(logEntry);

        if (error) {
            throw error;
        }

    } catch (error) {
        console.error('Falha ao registrar ação no log:', error.message, { action, details });
    }
}
