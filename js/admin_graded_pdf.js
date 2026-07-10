// admin_graded_pdf.js — 採点済みPDF出力
        function setGradedPdfProgressClass(el, percent) {
            if (!el) return;
            const rounded = Math.max(0, Math.min(100, Math.round(percent / 5) * 5));
            Array.from(el.classList).forEach(cls => {
                if (cls.startsWith('progress-p-')) el.classList.remove(cls);
            });
            el.classList.add(`progress-p-${rounded}`);
        }

        async function exportGradedPDF() {
            const overlay = document.getElementById('save-overlay');
            const overlayBar = document.getElementById('save-overlay-bar');
            const overlayText = document.getElementById('save-overlay-text');
            const overlayTitle = overlay.querySelector('h2');
            overlay.classList.add('is-visible-flex');
            setGradedPdfProgressClass(overlayBar, 0);
            overlayTitle.textContent = '採点済みPDFを生成中...';

            try {
                await refreshSupabaseScoringData();
                // 1) 採点結果を全問取得
                const finalResults = {}; // finalResults[qNum][entryNum] = 'correct' | undefined
                for (let q = 1; q <= totalQuestions; q++) {
                    finalResults[q] = scoresData[`__final__q${q}`] || {};
                }

                // 2) エントリーごとにスコア・連答を計算
                const entryResults = {};
                for (const en of entryNumbers) {
                    const answers = [];
                    for (let q = 1; q <= totalQuestions; q++) {
                        answers.push(finalResults[q][en] === 'correct' ? 1 : 0);
                    }
                    const score = answers.reduce((a, b) => a + b, 0);
                    const streaks = []; let cur = 0;
                    answers.forEach(a => { if (a === 1) { cur++; } else { streaks.push(cur); cur = 0; } });
                    streaks.push(cur);
                    // 上位2連答（出現順）
                    const topStreaks = streaks.slice(0, 2);
                    entryResults[en] = { score, topStreaks, answers };
                }

                // 3) 受付番号順にソート
                const sortedEntries = [...entryNumbers].sort((a, b) => a - b);

                // 4) jsPDF初期化
                window.jsPDF = window.jspdf.jsPDF;
                const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
                const pdfW = 210, pdfH = 297;
                let isFirstPage = true;

                const pages = await CIQSupabaseAPI.listAnswerPages(projectId);
                const supabasePagesByEntry = Object.fromEntries(pages.map(page => [Number(page.entries?.entry_number || 0), page]));
                const total = sortedEntries.length;
                for (let idx = 0; idx < total; idx++) {
                    const en = sortedEntries[idx];
                    overlayText.textContent = `${idx + 1} / ${total} 人処理中`;
                    setGradedPdfProgressClass(overlayBar, ((idx + 1) / total) * 100);

                    // ページ画像取得
                    let imageUrl = '';
                    const page = supabasePagesByEntry[en];
                    if (page?.storage_path) imageUrl = await CIQSupabaseAPI.getAnswerPageUrl(page.storage_path);
                    const pageRegions = page?.cells?.regions || null;
                    if (!imageUrl) continue;
                    if (!pageRegions) continue;

                    // 画像をCanvasにロード
                    const img = await new Promise((resolve, reject) => {
                        const i = new Image();
                        i.crossOrigin = 'anonymous';
                        i.onload = () => resolve(i);
                        i.onerror = reject;
                        i.src = imageUrl;
                    });

                    const canvas = document.createElement('canvas');
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);

                    // Keep A4 constants above for PDF page sizing; stored regions are already pixel coordinates.

                    // ○/× マーク描画（半透明）
                    const result = entryResults[en];
                    for (let q = 1; q <= totalQuestions; q++) {
                        const region = pageRegions[`q${q}`];
                        if (!region) continue;
                        const rx = region.x;
                        const ry = region.y;
                        const rw = region.w;
                        const rh = region.h;
                        const cx = rx + rw / 2;
                        const cy = ry + rh / 2;
                        const radius = Math.min(rw, rh) * 0.3;
                        const isCorrect = result.answers[q - 1] === 1;

                        ctx.save();
                        ctx.lineWidth = Math.max(2, radius * 0.15);

                        if (isCorrect) {
                            // ○ 緑（半透明）
                            ctx.globalAlpha = 0.45;
                            ctx.strokeStyle = '#34c759';
                            ctx.beginPath();
                            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
                            ctx.stroke();
                        } else {
                            // × 赤（半透明）
                            ctx.globalAlpha = 0.45;
                            ctx.strokeStyle = '#ff3b30';
                            const d = radius * 0.75;
                            ctx.beginPath();
                            ctx.moveTo(cx - d, cy - d);
                            ctx.lineTo(cx + d, cy + d);
                            ctx.moveTo(cx + d, cy - d);
                            ctx.lineTo(cx - d, cy + d);
                            ctx.stroke();
                        }
                        ctx.restore();
                    }

                    // スコア情報をマークシート上部に描画（赤文字）
                    const fontSize = Math.round(canvas.width * 0.022);
                    ctx.save();
                    ctx.font = `700 ${fontSize}px "SF Pro Text", -apple-system, BlinkMacSystemFont, "Helvetica Neue", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif`;
                    ctx.fillStyle = '#d70015';
                    ctx.globalAlpha = 0.9;

                    // 最後の問題セルの下
                    const lastRegion = pageRegions[`q${totalQuestions}`];
                    const scoreY = lastRegion
                        ? lastRegion.y + lastRegion.h + fontSize * 1.5
                        : canvas.height * 0.88;

                    const scoreText = `Score: ${result.score}  |  Streak 1: ${result.topStreaks[0] || 0}  |  Streak 2: ${result.topStreaks[1] || 0}`;
                    ctx.fillText(scoreText, canvas.width * 0.05, scoreY);
                    ctx.restore();

                    // jsPDFにページ追加
                    if (!isFirstPage) doc.addPage();
                    isFirstPage = false;

                    // 画像のアスペクト比を維持してA4に収める
                    const imgAspect = canvas.width / canvas.height;
                    const pageAspect = pdfW / pdfH;
                    let drawW, drawH, drawX, drawY;
                    if (imgAspect > pageAspect) {
                        drawW = pdfW;
                        drawH = pdfW / imgAspect;
                        drawX = 0;
                        drawY = (pdfH - drawH) / 2;
                    } else {
                        drawH = pdfH;
                        drawW = pdfH * imgAspect;
                        drawX = (pdfW - drawW) / 2;
                        drawY = 0;
                    }

                    doc.addImage(canvas.toDataURL('image/jpeg', 0.85), 'JPEG', drawX, drawY, drawW, drawH);
                }

                overlayText.textContent = 'PDFを保存中...';
                doc.save('graded_results.pdf');
                overlayText.textContent = '完了しました！';
                setTimeout(() => { overlay.classList.remove('is-visible-flex'); }, 1000);
                showAdminToast(`${total}人分の採点済みPDFを出力しました`, 'success');

            } catch (e) {
                console.error('PDF生成エラー:', e);
                overlay.classList.remove('is-visible-flex');
                showAdminToast('PDF生成エラー: ' + e.message);
            }
        }
