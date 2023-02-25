"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const package_json_1 = __importDefault(require("../package.json"));
const config_json_1 = __importDefault(require("../config/config.json"));
class Mod {
    constructor() {
        this.Name = `${package_json_1.default.author}-${package_json_1.default.name}`;
    }
    preAkiLoad(container) {
        Mod.container = container;
        this.logger = container.resolve("WinstonLogger");
        this.logger.info(`Loading: ${this.Name} ${package_json_1.default.version}${config_json_1.default.Enabled ? "" : " [Disabled]"}`);
        if (!config_json_1.default.Enabled) {
            return;
        }
        if (!config_json_1.default?.MagicItemsId?.AlwaysSurvived || !config_json_1.default?.MagicItemsId?.NoSave) {
            this.logger.error(`${this.Name} - One of "MagicItemsId" doesn't have items ID to be used, mod disabled...`);
            return;
        }
        container.afterResolution("InraidCallbacks", (_t, result) => {
            result.saveProgress = (url, info, sessionID) => {
                return this.saveProgress(url, info, sessionID);
            };
        }, { frequency: "Always" });
    }
    postDBLoad(container) {
        if (!config_json_1.default?.UseExtraSpecialSlot)
            return;
        const hashUtil = Mod.container.resolve("HashUtil");
        const jsonUtil = Mod.container.resolve("JsonUtil");
        const itemTables = Mod.container.resolve("DatabaseServer").getTables().templates.items;
        for (const id in itemTables) {
            const item = itemTables[id];
            if (!item?._props?.Slots || !item._props.Slots[0])
                continue;
            if (item._props.Slots[0]._name === "SpecialSlot1") {
                const copyItem = jsonUtil.clone(item._props.Slots[0]);
                copyItem._name = "SpecialSlotMagicSave";
                copyItem._id = hashUtil.generate();
                copyItem._props.filters[0].Filter = [config_json_1.default.MagicItemsId.AlwaysSurvived, config_json_1.default.MagicItemsId.NoSave];
                item._props.Slots.push(copyItem);
            }
        }
    }
    saveProgress(url, info, sessionID) {
        const httpResponse = Mod.container.resolve("HttpResponseUtil");
        const pmcData = Mod.container.resolve("ProfileHelper").getPmcProfile(sessionID);
        let saveItem;
        if (!info?.isPlayerScav) {
            for (const item of pmcData.Inventory.items) {
                if (config_json_1.default?.UseInventorySlots) {
                    if (item.slotId != "hideout" && this.checkMagicItem(item._tpl)) {
                        saveItem = item._tpl;
                        break;
                    }
                }
                if (config_json_1.default?.UseExtraSpecialSlot) {
                    if (item.slotId == "Pockets") {
                        for (const itemInPocket of pmcData.Inventory.items.filter(x => x.parentId == item._id)) {
                            if (itemInPocket.slotId !== "SpecialSlotMagicSave")
                                continue;
                            if (this.checkMagicItem(itemInPocket._tpl)) {
                                saveItem = itemInPocket._tpl;
                                break;
                            }
                        }
                    }
                    if (saveItem)
                        break;
                }
            }
            if (saveItem === config_json_1.default.MagicItemsId.NoSave) {
                this.logger.success(`${this.Name}: Magic Save Item Found, No Saving...`);
                if (config_json_1.default.RemoveNoSaveItemAfterUse)
                    this.removeMagicItem(pmcData, saveItem);
                return httpResponse.nullResponse();
            }
            else if (saveItem === config_json_1.default.MagicItemsId.AlwaysSurvived) {
                info.exit = "survived";
                this.logger.success(`${this.Name}: Magic Save Item Found, Save as Survived...`);
            }
        }
        Mod.container.resolve("InraidController").savePostRaidProgress(info, sessionID);
        if (config_json_1.default.RemoveAlwaysSurvivedItemAfterUse)
            this.removeMagicItem(pmcData, saveItem);
        return httpResponse.nullResponse();
    }
    removeMagicItem(pmcData, saveItem) {
        if (!saveItem)
            return pmcData;
        for (const i in pmcData.Inventory.items) {
            const item = pmcData.Inventory.items[i];
            if (item.slotId != "hideout" && item._tpl === saveItem) {
                this.logger.debug(`Magic save item found: "${item._id}" on pmc inventory, removed...`);
                if (item?.upd?.StackObjectsCount > 1) {
                    this.logger.debug(`Stacked item, Reduce stack instead of removeal...`);
                    item.upd.StackObjectsCount--;
                }
                else {
                    pmcData.Inventory.items.splice(i, 1);
                    for (let j = 0; j < pmcData.Inventory.items.length; j++) {
                        const childitem = pmcData.Inventory.items[j];
                        if (childitem.parentId === item._id) {
                            this.logger.debug(`Child item found: "${childitem._id}" on Magic save item's inventory, removed...`);
                            pmcData.Inventory.items.splice(j--, 1);
                        }
                    }
                }
                break;
            }
        }
        return pmcData;
    }
    checkMagicItem(itemTpl) {
        if (itemTpl === config_json_1.default.MagicItemsId.NoSave || itemTpl === config_json_1.default.MagicItemsId.AlwaysSurvived) {
            return true;
        }
        return false;
    }
}
module.exports = { mod: new Mod() };
