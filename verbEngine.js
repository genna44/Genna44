// Motore di coniugazione verbi giapponesi (Gruppo 1, 2, 3) estratto da script.js.

export function conjugate(v, form) {
        if(form === 'dizionario') return v.k;

        if(form === 'ta') {
            let teForm = conjugate(v, 'te');
            return teForm.slice(0, -1) + (teForm.slice(-1) === 'て' ? 'た' : 'だ');
        }
        
        if(form === 'nakatta') {
            let naiForm = conjugate(v, 'nai');
            return naiForm.slice(0, -1) + 'かった';
        }

        if(form === 'tari') {
            let taForm = conjugate(v, 'ta');
            return taForm + 'り';
        }

        let base = v.k;
        let lastChar = base.slice(-1);
        let root = base.slice(0, -1);

        if(v.g === 3) {
            let isKuru = base === '来る';
            let prefix = isKuru ? '' : base.replace('する', '');
            if(!isKuru) {
                if(form === 'masu') return prefix + 'します';
                if(form === 'masen') return prefix + 'しません';
                if(form === 'mashita') return prefix + 'しました';
                if(form === 'masendeshita') return prefix + 'しませんでした';
                if(form === 'te') return prefix + 'して';
                if(form === 'nai') return prefix + 'しない';
                if(form === 'volitiva') return prefix + 'しよう';
            } else {
                if(form === 'masu') return '来ます';
                if(form === 'masen') return '来ません';
                if(form === 'mashita') return '来ました';
                if(form === 'masendeshita') return '来ませんでした';
                if(form === 'te') return '来て';
                if(form === 'nai') return '来ない';
                if(form === 'volitiva') return '来よう';
            }
        }

        if(v.g === 2) {
            if(form === 'masu') return root + 'ます';
            if(form === 'masen') return root + 'ません';
            if(form === 'mashita') return root + 'ました';
            if(form === 'masendeshita') return root + 'ませんでした';
            if(form === 'te') return root + 'て';
            if(form === 'nai') return root + 'ない';
            if(form === 'volitiva') return root + 'よう';
        }

        if(v.g === 1) {
            const iStem = {'う':'い','く':'き','ぐ':'ぎ','す':'し','つ':'ち','ぬ':'に','ぶ':'び','む':'み','る':'り'}[lastChar];
            const aStem = {'う':'わ','く':'か','ぐ':'が','す':'さ','つ':'た','ぬ':'な','ぶ':'ば','む':'ま','る':'ら'}[lastChar];
            const oStem = {'う':'お','く':'こ','ぐ':'ご','す':'そ','つ':'と','ぬ':'の','ぶ':'ぼ','む':'も','る':'ろ'}[lastChar];

            if(['masu', 'masen', 'mashita', 'masendeshita'].includes(form)) {
                let suffix = form.replace('masendeshita', 'ませんでした').replace('mashita', 'ました').replace('masen', 'ません').replace('masu', 'ます');
                return root + iStem + suffix;
            }
            if(form === 'nai') return root + aStem + 'ない';
            if(form === 'volitiva') return root + oStem + 'う';

            if(form === 'te') {
                if(base === '行く') return '行って';
                if(['う','つ','る'].includes(lastChar)) return root + 'って';
                if(['む','ぶ','ぬ'].includes(lastChar)) return root + 'んで';
                if(lastChar === 'く') return root + 'いて';
                if(lastChar === 'ぐ') return root + 'いで';
                if(lastChar === 'す') return root + 'して';
            }
        }
        return base;
    }

export function conjugateKana(v, form) {
        if(form === 'dizionario') return v.r;

        if(form === 'ta') {
            let teForm = conjugateKana(v, 'te');
            return teForm.slice(0, -1) + (teForm.slice(-1) === 'て' ? 'た' : 'だ');
        }

        if(form === 'nakatta') {
            let naiForm = conjugateKana(v, 'nai');
            return naiForm.slice(0, -1) + 'かった';
        }

        if(form === 'tari') {
            let taForm = conjugateKana(v, 'ta');
            return taForm + 'り';
        }

        let base = v.r;
        let lastChar = base.slice(-1);
        let root = base.slice(0, -1);

        if(v.g === 3) {
            let isKuru = (v.k === '来る');
            let prefix = isKuru ? '' : base.replace('する', '');
            if(!isKuru) {
                if(form === 'masu') return prefix + 'します';
                if(form === 'masen') return prefix + 'しません';
                if(form === 'mashita') return prefix + 'しました';
                if(form === 'masendeshita') return prefix + 'しませんでした';
                if(form === 'te') return prefix + 'して';
                if(form === 'nai') return prefix + 'しない';
                if(form === 'volitiva') return prefix + 'しよう';
            } else {
                if(form === 'masu') return 'きます';
                if(form === 'masen') return 'きません';
                if(form === 'mashita') return 'きました';
                if(form === 'masendeshita') return 'きませんでした';
                if(form === 'te') return 'きて';
                if(form === 'nai') return 'こない';
                if(form === 'volitiva') return 'こよう';
            }
        }
        if(v.g === 2) {
            if(form === 'masu') return root + 'ます';
            if(form === 'masen') return root + 'ません';
            if(form === 'mashita') return root + 'ました';
            if(form === 'masendeshita') return root + 'ませんでした';
            if(form === 'te') return root + 'て';
            if(form === 'nai') return root + 'ない';
            if(form === 'volitiva') return root + 'よう';
        }
        if(v.g === 1) {
            const iStem = {'う':'い','く':'き','ぐ':'ぎ','す':'し','つ':'ち','ぬ':'に','ぶ':'び','む':'み','る':'り'}[lastChar];
            const aStem = {'う':'わ','く':'か','ぐ':'が','す':'さ','つ':'た','ぬ':'な','ぶ':'ば','む':'ま','る':'ら'}[lastChar];
            const oStem = {'う':'お','く':'こ','ぐ':'ご','す':'そ','つ':'と','ぬ':'の','ぶ':'ぼ','む':'も','る':'ろ'}[lastChar];

            if(['masu', 'masen', 'mashita', 'masendeshita'].includes(form)) {
                let suffix = form.replace('masendeshita', 'ませんでした').replace('mashita', 'ました').replace('masen', 'ません').replace('masu', 'ます');
                return root + iStem + suffix;
            }
            if(form === 'nai') return root + aStem + 'ない';
            if(form === 'volitiva') return root + oStem + 'う';

            if(form === 'te') {
                if(v.k === '行く') return 'いって';
                if(['う','つ','る'].includes(lastChar)) return root + 'って';
                if(['む','ぶ','ぬ'].includes(lastChar)) return root + 'んで';
                if(lastChar === 'く') return root + 'いて';
                if(lastChar === 'ぐ') return root + 'いで';
                if(lastChar === 'す') return root + 'して';
            }
        }
        return base;
    }

export function getExplanation(v, form, correctAns) {
        let lastChar = v.k.slice(-1);
        if(v.g === 3) return `È un verbo irregolare del Gruppo 3 da imparare a memoria! La forma corretta è <b>${correctAns}</b>.`;
        if(v.g === 2) return `È un verbo Vocalico (Gruppo 2). La regola è semplice: togli る e aggiungi la desinenza. Quindi ${v.k} diventa <b>${correctAns}</b>.`;
        if(form === 'volitiva') {
        if(v.g === 3) return `Gruppo 3 (Irregolare): la forma volitiva è fissa. Diventa <b>${correctAns}</b>.`;
        if(v.g === 2) return `Gruppo 2 (Vocalici): togli る e aggiungi よう. Risultato: <b>${correctAns}</b>.`;
        if(v.g === 1) return `Gruppo 1 (Consonantici): cambia la desinenza finale in riga -O e aggiungi う. Risultato: <b>${correctAns}</b>.`;
    }
    if(form === 'tari') {
        return `La forma in ～たり si basa sul passato piana (～た). Prendi la forma passata e aggiungi り: <b>${correctAns}</b>.`;
    }

        if(v.g === 1) {
            if(['masu', 'masen', 'mashita', 'masendeshita'].includes(form)) {
                let iStem = {'う':'い','く':'き','ぐ':'ぎ','す':'し','つ':'ち','ぬ':'に','ぶ':'び','む':'み','る':'り'}[lastChar];
                return `È un verbo Consonantico (Gruppo 1). L'ultima sillaba ${lastChar} diventa ${iStem}. Aggiungendo la desinenza otteniamo <b>${correctAns}</b>.`;
            }
            if(form === 'nai') {
                let aStem = {'う':'わ','く':'か','ぐ':'が','す':'さ','つ':'た','ぬ':'な','ぶ':'ば','む':'ま','る':'ら'}[lastChar];
                return `È un verbo Consonantico (Gruppo 1). Per la forma piana negativa, ${lastChar} diventa ${aStem} + ない. Risultato: <b>${correctAns}</b>.`;
            }
            if(form === 'te') {
                if(v.k === '行く') return `Attenzione! 行く è un'eccezione del Gruppo 1. La sua forma in て è irregolare: <b>${correctAns}</b>.`;
                if(['う','つ','る'].includes(lastChar)) return `Gruppo 1: i verbi in ${lastChar} perdono la sillaba e prendono って. Risultato: <b>${correctAns}</b>.`;
                if(['む','ぶ','ぬ'].includes(lastChar)) return `Gruppo 1: i verbi in ${lastChar} perdono la sillaba e prendono んで. Risultato: <b>${correctAns}</b>.`;
                if(lastChar === 'く') return `Gruppo 1: finisce in く, quindi prende いて. Risultato: <b>${correctAns}</b>.`;
                if(lastChar === 'ぐ') return `Gruppo 1: finisce in ぐ, quindi prende いで. Risultato: <b>${correctAns}</b>.`;
                if(lastChar === 'す') return `Gruppo 1: finisce in す, quindi prende して. Risultato: <b>${correctAns}</b>.`;
            }
        }
        return `La risposta corretta è <b>${correctAns}</b>.`;
    }

