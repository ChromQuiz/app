// help.js - accessible FAQ accordion behavior

document.querySelectorAll('.qa-question').forEach((question) => {
    const answerId = question.getAttribute('aria-controls');
    const answer = answerId ? document.getElementById(answerId) : null;
    const item = question.closest('.qa-item');
    if (!answer || !item) return;

    question.addEventListener('click', () => {
        const expanded = question.getAttribute('aria-expanded') !== 'true';
        question.setAttribute('aria-expanded', String(expanded));
        answer.setAttribute('aria-hidden', String(!expanded));
        item.classList.toggle('open', expanded);
    });
});
