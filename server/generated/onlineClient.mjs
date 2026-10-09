export const apiBase = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
export class NetworkError extends Error {
    status;
    constructor(status, message) { super(message); this.status = status; }
}
export async function fetchApi(path, token = '', options = {}) {
    let response;
    try {
        response = await fetch(apiBase + '/api' + path, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}), ...options.headers }, signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000) });
    }
    catch (e) {
        if (e.name === 'AbortError')
            throw e;
        throw new NetworkError(0, 'Сервер недоступен. Проверь его запуск или адрес подключения.');
    }
    let data;
    try {
        data = await response.json();
    }
    catch {
        throw new NetworkError(response.status, 'Ответ сервера не похож на API. Для GitHub Pages укажи адрес сервера при сборке сайта.');
    }
    if (!response.ok)
        throw new NetworkError(response.status, data.message || 'Не удалось выполнить запрос.');
    return data;
}
