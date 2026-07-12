// help.js - contextual back link and accessible FAQ accordion behavior

const helpBackLink = document.getElementById('help-back-link');
const hasOpsSession = typeof session !== 'undefined'
    && Boolean(session.projectId)
    && Boolean(session.scorerName)
    && (session.scorerRole === 'admin' || session.scorerRole === 'scorer');

if (helpBackLink && hasOpsSession && typeof opsBackTarget === 'function') {
    helpBackLink.href = opsBackTarget();
    helpBackLink.dataset.backFallback = opsBackTarget();
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
