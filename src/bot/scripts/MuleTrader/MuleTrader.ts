import type { SettingsSchema } from '../../runtime/Settings.js';
import { Bank } from '../../api/bank/Bank.js';
import { Banking } from '../../api/bank/Banking.js';
import { LoopingBot } from '../../api/bot/Bot.js';
import { Execution } from '../../api/execution/Execution.js';
import { Inventory } from '../../api/inventory/Inventory.js';
import { Game } from '../../api/game/Game.js';
import { Players } from '../../api/players/Players.js';
import type { Player } from '../../api/model/Player.js';
import { Trade } from '../../api/trade/Trade.js';
import Tile from '../../geometry/Tile.js';
import { Traversal } from '../../api/walking/Traversal.js';

export default class MuleTrade extends LoopingBot {
    private targetPlayer = 'ineedbots';
    private targetItem = 'Rune essence';
    private targetLocation: Tile = new Tile(0, 0, -1);

    override async onStart(): Promise<void> {
        await Execution.delayUntil(() => Game.ingame(), 0);
        this.targetPlayer = this.settings.str('targetPlayer', 'ineedbots');
        this.targetItem = this.settings.str('targetItem', 'Rune essence');
        this.targetLocation = this.settings.tile('targetLocation', new Tile(0, 0, -1));
        this.log(`Mule started — target: ${this.targetPlayer || '(none)'} - item: ${this.targetItem || '(none)'}`);
    }

    async loop(): Promise<void> {
        if (!this.targetItem) {
            this.log('No target item set');
            await Execution.delayTicks(5);
            return;
        }

        if (this.targetLocation.level !== -1) {
            const tile = Game.tile()
            if (tile && this.targetLocation.distanceTo(tile) > 50) {
                await Traversal.walkResilient(this.targetLocation, { radius: 3, attempts: 6, timeoutMs: 240_000, log: m => this.log(`  ${m}`) });
                await Execution.delayTicks(5);
            }
        }

        // 1. Open bank if not open
        if (!Bank.isOpen()) {
            const opened = await Banking.open({ preferNearby: true, log: m => this.log(m) });
            if (!opened) {
                this.log('Could not open bank');
                await Execution.delayTicks(2);
                return;
            }
            await Bank.waitReady(6000, m => this.log(m));
            return;
        }

        // 2. Deposit everything else first
        if (Inventory.used() > 0) {
            await Bank.depositInventory();
            await Execution.delayUntil(() => Inventory.used() === 0, 4000);
        }

        // 3. Enable note mode
        await Bank.setNoteMode(true);
        await Execution.delayTicks(1);

        // 4. Withdraw a full load of noted rune essence
        if (!Inventory.contains(this.targetItem) && Bank.count(this.targetItem) <= 0) {
            this.log('No item in bank left');
            await Execution.delayTicks(10);
            throw new Error(`No items left`);
            return;
        }

        if (Bank.count(this.targetItem) > 0) {
            await Bank.withdrawLoad(this.targetItem);
        }
        await Execution.delayUntil(() => Inventory.contains(this.targetItem), 3000);

        if (Inventory.contains(this.targetItem)) {
            await this.tradeToPlayer();
        }
    }

    private async tradeToPlayer(): Promise<void> {
        // Close bank first so trade screen can appear
        if (Bank.isOpen()) {
            await Bank.close(3000);
            await Execution.delayTicks(1);
        }

        if (!this.targetPlayer) {
            this.log('No target player set');
            await Execution.delayTicks(5);
            return;
        }

        // Find the target player in the scene
        const target: Player | null = Players.query().name(this.targetPlayer).nearest();
        if (!target) {
            this.log(`Player not found: ${this.targetPlayer}`);
            await Execution.delayTicks(5);
            return;
        }

        // If not already in a trade, request one
        if (!Trade.active()) {
            await Trade.request(this.targetPlayer);
            const opened = await Execution.delayUntil(
                () => Trade.onOfferScreen() || Trade.onConfirmScreen(),
                5000
            );
            if (!opened) {
                this.log('Trade window did not open');
                return;
            }
        }

        // Offer all noted essence
        if (Trade.onOfferScreen()) {
            const essCount = Inventory.count(this.targetItem);
            if (essCount > 0) {
                await Trade.offerAll(this.targetItem);
                await Execution.delayTicks(1);
            }
            await Trade.accept();
            await Execution.delayUntil(() => Trade.onConfirmScreen(), 3000);
        }

        // Confirm screen
        if (Trade.onConfirmScreen()) {
            await Trade.accept();
            await Execution.delayUntil(() => !Trade.active(), 3000);
            Execution.noteProgress();
            this.log(`Trade complete`);
        }
    }

    override onStop(): void {
        this.log(`Stopped`);
    }

    override onPaint(ctx: CanvasRenderingContext2D): void {
        ctx.font = '12px monospace';
        const text = `MuleTrader`;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(6, 6, ctx.measureText(text).width + 12, 24);
        ctx.fillStyle = '#ffb15b';
        ctx.fillText(text, 12, 22);
    }
};

export const MULETRADER_SETTINGS: SettingsSchema = {
    targetPlayer: {
        type: 'string',
        default: 'ineedbots',
        label: 'Target player',
        help: 'Display name of the player to trade noted essence to',
    },
    targetItem: {
        type: 'string',
        default: 'Rune essence',
        label: 'Target item',
        help: 'Display name of the item to trade',
    },
    targetLocation: {
        type: 'tile',
        default: new Tile(0, 0, -1),
        label: 'Location'
    },
};