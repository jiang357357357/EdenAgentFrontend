import { Bot, ImageOff } from 'lucide-react';
import { resolveCoreAssetUrl, type ActiveCharacterAction, type CoreAssistant } from '../../lib/auth';
import { CharacterPerformanceStage } from './CharacterPerformanceStage';
import { resolveAssistantAppearance } from './assistant-appearance';
import { CharacterVisualRenderer } from './renderer/CharacterVisualRenderer';
import { isMemoryLobbySpineAsset } from './renderer/spine/spine-layout';

interface CharacterPanelProps {
  assistant?: CoreAssistant | null;
  assistantError?: string;
  activeAction?: ActiveCharacterAction;
}

export function CharacterPanel({ assistant, assistantError, activeAction }: CharacterPanelProps) {
  const character = assistant?.character;
  const displayName = assistant?.name || character?.name || '默认助手';
  const activeActionImage =
    activeAction?.imageUrl ||
    activeAction?.action?.static_image_url ||
    activeAction?.action?.dynamic_preview_url ||
    activeAction?.action?.dynamic_frames?.[0]?.file_url;
  const image = resolveCoreAssetUrl(activeActionImage || character?.default_standing_image_url);
  const appearance = resolveAssistantAppearance(assistant);
  const spineAsset = character?.visual_preference === 'spine' ? appearance.asset : undefined;
  const hasSpine = Boolean(spineAsset);
  const hasVisual = Boolean(character && (hasSpine || image));
  const memoryLobby = hasSpine && isMemoryLobbySpineAsset(spineAsset);

  return (
    <aside className="flex h-[100vh] w-[34vw] flex-none items-end justify-center overflow-hidden border-l border-border bg-bg">
      <div className="relative h-full w-full overflow-hidden">
        {hasVisual && character ? (
          <CharacterPerformanceStage
            activeAction={activeAction}
            className={memoryLobby ? "absolute inset-0 flex justify-center" : "absolute inset-x-0 bottom-0 flex h-[96vh] justify-center"}
            contentClassName={hasSpine ? "w-full" : undefined}
          >
            <CharacterVisualRenderer
              character={character}
              activeAction={activeAction}
              displayName={displayName}
              preferredSpineLayout={appearance.layout}
              preferredCostumeId={appearance.costumeKey}
              strictSpineSelection
              className="relative h-full w-full"
            />
          </CharacterPerformanceStage>
        ) : (
          <div className="flex h-full w-full items-center justify-center px-[3vw] text-center">
            <div className="rounded-3xl border border-border bg-card/80 p-[4vh] shadow-sm">
              <div className="mx-auto mb-[2vh] flex h-[8vh] w-[8vh] items-center justify-center rounded-2xl border border-border bg-bg text-text-muted">
                {assistant ? <ImageOff className="h-[4vh] w-[4vh]" /> : <Bot className="h-[4vh] w-[4vh]" />}
              </div>
              <div className="font-serif text-[2.2vh] text-text">
                {assistant ? '未配置立绘' : '未绑定默认助手'}
              </div>
              <p className="mt-[1vh] text-[1.35vh] leading-relaxed text-text-muted">
                {assistantError || (assistant ? '请在角色编辑里添加待机动作图片。' : '请在 Core 助手管理里设置默认助手。')}
              </p>
            </div>
          </div>
        )}

      </div>
    </aside>
  );
}
