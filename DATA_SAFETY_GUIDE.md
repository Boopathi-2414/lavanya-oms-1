# 🔒 Lavanya OMS v5 — தரவுப் பாதுகாப்பு வழிமுறை
# Data Safety & Backup Guide

---

## உங்கள் 916 லேபிள்கள் எங்கே சேமிக்கப்படுகின்றன?

உங்கள் அனைத்து ஆர்டர் தரவும் **உலாவியின் localStorage**-ல் சேமிக்கப்படுகிறது.
இது உங்கள் சாதனத்தில் (Phone/PC) உள்ளூரிலேயே இருக்கும்.

**localStorage keys (உங்கள் தரவு இங்கே உள்ளது):**
- `oms_orders` — அனைத்து ஆர்டர்களும்
- `oms_payments` — கட்டண விவரங்கள்
- `oms_products` — பொருட்கள் பட்டியல்
- `oms_trash` — நீக்கப்பட்டவை
- `oms_fraud_list` — மோசடி பட்டியல்

---

## ✅ தரவு பாதுகாப்பு உறுதிப்படுத்தல்

இந்த அப்ளிகேஷனில் **எந்த இடத்திலும்** localStorage.clear() அல்லது
localStorage.removeItem() தானாக அழைக்கப்படுவதில்லை.

Supabase இணைப்பு தோல்வியடைந்தாலும்:
- ✅ உங்கள் தரவு பாதுகாப்பாக இருக்கும்
- ✅ App பழையபடி செயல்படும்
- ✅ எந்த தரவும் நீக்கப்படாது

---

## 📦 தினசரி பேக்கப் (Manual Backup)

### முறை 1: Browser Console வழி
1. Chrome/Edge திறக்கவும்
2. F12 → Console tab
3. இந்த கோடை paste செய்யவும்:

```javascript
// உங்கள் அனைத்து தரவையும் JSON-ஆக export செய்யும்
const backup = {};
['oms_orders','oms_payments','oms_products','oms_trash','oms_fraud_list'].forEach(k => {
  const val = localStorage.getItem(k);
  if (val) backup[k] = JSON.parse(val);
});
const blob = new Blob([JSON.stringify(backup, null, 2)], {type:'application/json'});
const a = document.createElement('a');
a.href = URL.createObjectURL(blob);
a.download = `lavanya-oms-backup-${new Date().toISOString().split('T')[0]}.json`;
a.click();
console.log('✅ Backup downloaded!');
```

### முறை 2: App Settings Tab வழி
- Settings → "Export Data" பட்டனை கிளிக் செய்யவும் (if available)

---

## 🔄 தரவை மீட்டெடுப்பு (Restore)

```javascript
// Backup file-ஐ restore செய்ய:
const input = document.createElement('input');
input.type = 'file';
input.accept = '.json';
input.onchange = e => {
  const reader = new FileReader();
  reader.onload = ev => {
    const data = JSON.parse(ev.target.result);
    Object.entries(data).forEach(([k, v]) => {
      localStorage.setItem(k, JSON.stringify(v));
    });
    console.log('✅ Data restored! Refresh the page.');
    location.reload();
  };
  reader.readAsText(e.target.files[0]);
};
input.click();
```

---

## 🌐 Vercel Deployment — Environment Variables

Vercel Dashboard-ல் இந்த இரண்டு variables-ஐ சேர்க்கவும்:

| Variable Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://ewgwamauakzkjwrwdgpk.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `sb_publishable_NlEP5QellQOwt7zS9DVzVQ_Yr5T_Fom` |

**Steps:**
1. vercel.com → உங்கள் Project → Settings
2. Environment Variables → Add
3. மேலே உள்ள இரண்டையும் சேர்க்கவும்
4. Redeploy (Deployments → ··· → Redeploy)

---

## ⚠️ முக்கியமான எச்சரிக்கைகள்

1. **Browser cache clear செய்யாதீர்கள்** — இது localStorage-ஐ அழிக்கும்
2. **Incognito mode-ல் app திறக்காதீர்கள்** — தரவு சேமிக்கப்படாது
3. **வேறொரு browser-ல்** app திறந்தால் தரவு தெரியாது (localStorage browser-specific)
4. மாதம் ஒருமுறை மேலே உள்ள Backup script-ஐ இயக்கி JSON save செய்யுங்கள்

---

## 🆘 Emergency: தரவு காணாமல் போனால்

1. முதலில் **அதே browser-ல்** (Chrome/Edge) App திறக்கவும்
2. Console-ல் சரிபார்க்கவும்: `localStorage.getItem('oms_orders')`
3. கடைசியாக சேமித்த Backup JSON file-ஐ மேலே உள்ள Restore script மூலம் ஏற்றவும்
4. Supabase-ல் உள்ள Data-ஐ மீட்டெடுக்க: Settings tab → "Pull from Supabase"

---

*Lavanya OMS v5 | Generated: 2026-06-23*
