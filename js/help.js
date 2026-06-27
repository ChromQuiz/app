// help.js - FAQ accordion behavior

document.querySelectorAll('.qa-question').forEach((question) => {
    question.addEventListener('click', () => {
        question.parentElement?.classList.toggle('open');
    });
});
