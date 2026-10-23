import Skill from '#/client/shell/Skill.js';

interface XpDrop {
    skill: number;
    amount: number;
    createdAt: number;
}

export default class XpDrops {
    private readonly totals: (number | undefined)[] = new Array(Skill.count);
    private drops: XpDrop[] = [];

    clear(): void {
        this.totals.fill(undefined);
        this.drops = [];
    }

    update(skill: number, total: number, now: number = performance.now()): void {
        if (!Number.isInteger(skill) || skill < 0 || skill >= Skill.count || Skill.names[skill] === '-unused-') {
            return;
        }

        const previous = this.totals[skill];
        this.totals[skill] = total;
        // The first stat packet is the login baseline, even when the account already has XP.
        if (previous === undefined || total <= previous) {
            return;
        }

        this.drops.push({ skill, amount: total - previous, createdAt: now });
        this.drops = this.drops.filter(drop => now - drop.createdAt < 2500).slice(-6);
    }

    visible(now: number = performance.now()): { skill: number; amount: number; y: number }[] {
        this.drops = this.drops.filter(drop => now - drop.createdAt < 2500);
        let below = 204;
        const visible = [];
        for (let i = this.drops.length - 1; i >= 0; i--) {
            const drop = this.drops[i];
            const y = Math.min(180 - Math.floor((now - drop.createdAt) * 0.06), below - 24);
            below = y;
            if (y >= 24) {
                visible.push({ skill: drop.skill, amount: drop.amount, y });
            }
        }
        return visible;
    }
}
