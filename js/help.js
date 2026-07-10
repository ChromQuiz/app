// help.js - contextual back link and accessible FAQ accordion behavior

const helpBackLink = document.getElementById('help-back-link');
const helpBackLabel = document.getElementById('help-back-label');
const hasOpsSession = typeof session !== 'undefined'
    && Boolean(session.projectId)
    && Boolean(session.scorerName)
    && (session.scorerRole === 'admin' || session.scorerRole === 'scorer');

if (helpBackLink && helpBackLabel && hasOpsSession && typeof opsBackTarget === 'function') {
    helpBackLink.href = opsBackTarget();
    helpBackLabel.textContent = `${typeof opsBackLabel === 'function' ? opsBackLabel() : '運営画面'}に戻る`;
}

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
