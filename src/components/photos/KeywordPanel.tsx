"use client";

import { Button, MenuItem, Modal, Text, View } from "reshaped";
import type { KeywordCount } from "./gallery-api";
import { CloseIcon } from "./icons";

interface Props {
  open: boolean;
  vocabulary: KeywordCount[];
  selected: readonly string[];
  onToggle: (slug: string) => void;
  onClear: () => void;
  onClose: () => void;
}

/**
 * The keyword filter, as a drawer from the start edge.
 *
 * Overlaying rather than displacing the grid is a layout decision as much as a
 * visual one: pushing the grid aside would change its width, which changes the
 * column width, which invalidates every packed position — a full repack and a
 * scroll jump every time the drawer is toggled. Floating over the grid means
 * opening it costs nothing.
 *
 * Reshaped's Modal does the dialog work: it traps focus while open, closes on
 * Escape and on the scrim, and returns focus to the control that opened it.
 */
export default function KeywordPanel({
  open,
  vocabulary,
  selected,
  onToggle,
  onClear,
  onClose,
}: Props) {
  return (
    <Modal
      active={open}
      onClose={onClose}
      position="start"
      size="22rem"
      ariaLabel="Filter by keyword"
    >
      <View gap={3}>
        <View direction="row" align="center" justify="space-between">
          <Modal.Title>
            <Text variant="body-2" weight="medium">
              Keywords
            </Text>
          </Modal.Title>
          <Button
            variant="ghost"
            icon={CloseIcon}
            onClick={onClose}
            attributes={{ "aria-label": "Close keyword filters" }}
          />
        </View>

        {selected.length > 0 && (
          <View.Item>
            <Button variant="outline" size="small" onClick={onClear}>
              Clear all ({selected.length})
            </Button>
          </View.Item>
        )}

        {vocabulary.length === 0 ? (
          <Text variant="body-2" color="neutral-faded">
            No keywords yet.
          </Text>
        ) : (
          <View as="ul" gap={1} attributes={{ style: { listStyle: "none", margin: 0, padding: 0 } }}>
            {vocabulary.map((keyword) => {
              const isSelected = selected.includes(keyword.slug);
              return (
                <View as="li" key={keyword.slug}>
                  <MenuItem
                    selected={isSelected}
                    onClick={() => onToggle(keyword.slug)}
                    endSlot={
                      <Text variant="caption-1" color={isSelected ? undefined : "neutral-faded"}>
                        {keyword.count}
                      </Text>
                    }
                    // Announces both the choice and its current state, so the
                    // list reads as a set of toggles rather than as links.
                    attributes={{ "aria-pressed": isSelected }}
                  >
                    {keyword.label}
                  </MenuItem>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </Modal>
  );
}
