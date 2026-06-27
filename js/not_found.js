// not_found.js - 404 page actions

document.addEventListener('DOMContentLoaded', () => {
    const backButton = document.getElementById('back-button');
    backButton?.addEventListener('click', () => {
        if (window.history.length > 1) {
            window.history.back();
        } else {
            window.location.href = 'index.html';
        }
    });
});
