// index.js — ログイン / プロジェクト作成（Firebase SDK版）

function getOrdinalSuffix(n) {
	const mod100 = n % 100;
	if (mod100 >= 11 && mod100 <= 13) return 'th';
	switch (n % 10) {
		case 1: return 'st';
		case 2: return 'nd';
		case 3: return 'rd';
		default: return 'th';
	}
}

function generateStrongPassword() {
	const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
	const lower = 'abcdefghijklmnopqrstuvwxyz';
	const num = '0123456789';
	const all = upper + lower + num;
	let pwd = '';
	pwd += upper[Math.floor(Math.random() * upper.length)];
	pwd += lower[Math.floor(Math.random() * lower.length)];
	pwd += num[Math.floor(Math.random() * num.length)];
	for(let i = 3; i < 14; i++) {
		pwd += all[Math.floor(Math.random() * all.length)];
	}
	return pwd.split('').sort(() => 0.5 - Math.random()).join('');
}



let currentTab = 'join';

function setTab(tab) {
	currentTab = tab;
	const tabJoin = document.getElementById('tab-join');
	const tabCreate = document.getElementById('tab-create');
	if (tabJoin) tabJoin.className = tab === 'join' ? 'tab active' : 'tab';
	if (tabCreate) tabCreate.className = tab === 'create' ? 'tab active' : 'tab';

	document.getElementById('section-join').hidden = tab !== 'join';
	document.getElementById('section-create').hidden = tab !== 'create';
}

function showError(msg) {
	const el = document.getElementById('status-msg');
	el.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> ' + msg;
	el.style.display = 'block';
	setTimeout(() => el.style.display = 'none', 5000);
}

function togglePassword(id, iconId) {
	const input = document.getElementById(id);
	const icon = document.getElementById(iconId);
	if (input.type === "password") {
		input.type = "text";
		if (icon) { icon.classList.remove('fa-eye'); icon.classList.add('fa-eye-slash'); }
	} else {
		input.type = "password";
		if (icon) { icon.classList.remove('fa-eye-slash'); icon.classList.add('fa-eye'); }
	}
}

async function copyToClipboard(id, btn) {
	const input = document.getElementById(id);
	try {
		await navigator.clipboard.writeText(input.value);
		const orig = btn.innerHTML;
		btn.innerHTML = '<i class="fa-solid fa-check"></i>';
		setTimeout(() => btn.innerHTML = orig, 1500);
	} catch (err) {
		showError('コピーに失敗しました');
	}
}

async function joinProject() {
	await waitForAuth();
	const pid = document.getElementById('join-id').value.trim();
	const pwd = document.getElementById('join-password').value;
	const name = document.getElementById('join-name').value.trim();
	const btn = document.getElementById('login-btn');

	if (!pid || !pwd || !name) {
		showError('全ての項目を入力してください');
		return;
	}

	btn.disabled = true;
	btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> 認証中...';

	try {
		// まず公開設定が存在するか確認する
		const pubSettings = await dbGet(`projects/${pid}/publicSettings`);
		if (!pubSettings) {
			// 旧バージョンとの互換性チェック
			const oldSettings = await dbGet(`projects/${pid}/settings`);
			if (oldSettings) {
				// 旧システムのログイン
				const pwdHash = await AppCrypto.hashPassword(pwd);
				if (oldSettings.passwordHash ? oldSettings.passwordHash !== pwdHash : oldSettings.password !== pwd) {
					throw new Error('パスワードが間違っています。');
				}
				session.set('projectId', pid);
				session.set('scorer_name', name);
				session.set('scorer_role', 'admin');
				location.href = 'admin.html';
				return;
			}
			throw new Error('指定されたプロジェクトIDが見つかりません');
		}

		// 新バージョンのログイン判定 (入力されたパスワードのハッシュで探る)
		const hash = await AppCrypto.hashPassword(pwd);

		const configData = await dbGet(`projects/${pid}/protected/${hash}/settings`);
		if (configData) {
			if (configData.role === 'scorer') {
				// 同名チェック: 既に採点中の同名採点者がいるか
				const scoresData = await dbGet(`projects/${pid}/protected/${hash}/scores`);
				if (scoresData) {
					const usedNames = new Set();
					for (const key in scoresData) {
						if (key.startsWith('__scorers__')) {
							const scorers = scoresData[key];
							if (scorers) Object.keys(scorers).forEach(n => usedNames.add(n));
						}
					}
					if (usedNames.has(name)) {
						const isSame = await showConfirm(
							`「${name}」は既にこのプロジェクトで採点に参加しています。\n\n同一人物ですか？\n（別人の場合は「いいえ」を選んで名前を変更してください）`,
							'はい、同一人物です'
						);
						if (!isSame) {
							btn.disabled = false;
							btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> ログイン';
							return;
						}
					}
				}
				// Scorer login
				session.set('projectId', pid);
				session.set('scorer_name', name);
				session.set('scorer_role', 'scorer');
				session.set('secretHash', hash);
				dbSet(`projects/${pid}/publicSettings/lastAccess`, SERVER_TIMESTAMP).catch(() => {});
				location.href = 'judge.html';
				return;
			} else {
				// Admin login
				session.set('projectId', pid);
				session.set('scorer_name', name);
				session.set('scorer_role', 'admin');
				session.set('secretHash', configData.scorerHash);
				session.set('adminHash', hash);
				
				try {
					const privJwkStr = await AppCrypto.decryptAES(configData.encryptedPrivateKey, pwd);
					session.set('privateKeyJwk', privJwkStr);
				} catch (e) {
					console.error("Failed to decrypt private key");
				}
				dbSet(`projects/${pid}/publicSettings/lastAccess`, SERVER_TIMESTAMP).catch(() => {});
				location.href = 'admin.html';
				return;
			}
		}

		throw new Error('アクセスコード または パスワードが間違っています');

	} catch (e) {
		showError(e.message);
		btn.disabled = false;
		btn.innerHTML = '部屋へ入る <i class="fa-solid fa-arrow-right-to-bracket"></i>';
	}
}

async function createProject() {
	await waitForAuth();
	const edition = parseInt(document.getElementById('create-edition').value);
	const name = document.getElementById('create-name').value.trim();
	const adminPwd = generateStrongPassword();
	const scorerPwd = generateStrongPassword();
	const btn = document.getElementById('create-btn');

	if (!edition || edition < 1 || !name) {
		showError('回数とお名前を入力してください');
		return;
	}

	const pid = `ciq${edition}`;
	const pName = `CIQ the ${edition}${getOrdinalSuffix(edition)}`;

	btn.disabled = true;
	btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> 作成中...';

	try {
		// 既存プロジェクトの重複チェック
		const existing = await dbGet(`projects/${pid}/publicSettings`);
		if (existing) {
			throw new Error(`プロジェクト "${pid}" は既に存在します。別の回数を指定してください。`);
		}

		// ハッシュ計算
		const adminHash = await AppCrypto.hashPassword(adminPwd);
		const scorerHash = await AppCrypto.hashPassword(scorerPwd);

		// RSAキーペアの生成 (PIIのE2E暗号化用)
		const { publicKeyJwk, privateKeyJwk } = await AppCrypto.generateRSAKeyPair();

		// 秘密鍵を管理者パスワードでAES暗号化
		const encryptedPriv = await AppCrypto.encryptAES(JSON.stringify(privateKeyJwk), adminPwd);

		// DB保存 (multi-path update)
		const updates = {};
		updates[`publicSettings`] = {
			projectName: pName,
			publicKey: publicKeyJwk,
			createdAt: SERVER_TIMESTAMP,
			lastAccess: SERVER_TIMESTAMP
		};
		updates[`protected/${scorerHash}/settings`] = {
			role: 'scorer',
			createdAt: SERVER_TIMESTAMP
		};
		updates[`protected/${adminHash}/settings`] = {
			adminCreator: name,
			scorerHash: scorerHash,
			encryptedPrivateKey: encryptedPriv
		};

		await dbUpdate(`projects/${pid}`, updates);

		// セッションセットアップ
		session.set('projectId', pid);
		session.set('scorer_name', name);
		session.set('scorer_role', 'admin');
		session.set('secretHash', scorerHash);
		session.set('adminHash', adminHash);
		session.set('privateKeyJwk', JSON.stringify(privateKeyJwk));

		// UIDisplay
		const tabsContainer = document.getElementById('tabs-container');
		if (tabsContainer) tabsContainer.hidden = true;
		document.getElementById('section-create').hidden = true;
		document.getElementById('section-success').hidden = false;
		document.getElementById('success-id').value = pid;
		document.getElementById('success-admin-pwd').value = adminPwd;
		document.getElementById('success-pwd').value = scorerPwd;

	} catch (e) {
		showError('作成に失敗しました: ' + e.message);
		btn.disabled = false;
		btn.innerHTML = '新しいプロジェクトを作成 <i class="fa-solid fa-plus"></i>';
	}
}

// エンターキー対応
let composing = false;
document.addEventListener('compositionstart', () => { composing = true; });
document.addEventListener('compositionend', () => {
	setTimeout(() => { composing = false; }, 500);
});
document.addEventListener('keyup', (e) => {
	if (e.key === 'Enter' && !composing) {
		if (currentTab === 'join') {
			joinProject();
		} else if (currentTab === 'create') {
			createProject();
		}
	}
});