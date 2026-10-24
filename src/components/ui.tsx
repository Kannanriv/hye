import { Ionicons } from '@expo/vector-icons';
import { ComponentProps, memo, ReactNode } from 'react';
import {
  ActivityIndicator, Modal, Pressable, StyleSheet, Switch, Text, TextInput, TextInputProps, View, ViewStyle,
} from 'react-native';

import type { SourcePlatform } from '@/domain/types';
import { Colors, radius, space, type } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Txt({ children, variant = 'body', color, style, numberOfLines }: {
  children: ReactNode; variant?: keyof typeof type; color?: keyof Colors; style?: object; numberOfLines?: number;
}) {
  const { colors } = useTheme();
  return (
    <Text numberOfLines={numberOfLines} style={[type[variant], { color: colors[color ?? 'text'] }, style]}>
      {children}
    </Text>
  );
}

export function Button({ label, onPress, variant = 'primary', icon, disabled, loading, compact, accessibilityHint }: {
  label: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; icon?: IconName;
  disabled?: boolean; loading?: boolean; compact?: boolean; accessibilityHint?: string;
}) {
  const { colors } = useTheme();
  const bg = { primary: colors.accent, secondary: colors.surfaceAlt, ghost: 'transparent', danger: colors.danger }[variant];
  const fg = { primary: colors.onAccent, secondary: colors.text, ghost: colors.accent, danger: '#FFFFFF' }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled || !!loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
      <Text style={[type.subheading, { color: fg, fontSize: compact ? 14 : 16 }]}>{label}</Text>
    </Pressable>
  );
}

export function IconButton({ icon, label, onPress, color, size = 22 }: {
  icon: IconName; label: string; onPress: () => void; color?: keyof Colors; size?: number;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.iconButton, pressed && { backgroundColor: colors.surfaceAlt }]}
    >
      <Ionicons name={icon} size={size} color={colors[color ?? 'text']} />
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, count }: { label: string; selected?: boolean; onPress: () => void; count?: number }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={[styles.chip, { backgroundColor: selected ? colors.accent : colors.surface, borderColor: selected ? colors.accent : colors.border }]}
    >
      <Text style={[type.small, { color: selected ? colors.onAccent : colors.text, fontWeight: '600' }]} numberOfLines={1}>
        {label}
        {count ? ` · ${count}` : ''}
      </Text>
    </Pressable>
  );
}

export function TextField(props: TextInputProps & { label?: string; error?: string }) {
  const { colors } = useTheme();
  const { label, error, style, ...rest } = props;
  return (
    <View style={{ gap: space.xs }}>
      {label ? <Txt variant="small" color="textMuted">{label}</Txt> : null}
      <TextInput
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={label ?? props.placeholder}
        {...rest}
        style={[styles.input, { backgroundColor: colors.surface, borderColor: error ? colors.danger : colors.border, color: colors.text }, style]}
      />
      {error ? <Txt variant="caption" color="danger">{error}</Txt> : null}
    </View>
  );
}

const PLATFORM_LABEL: Record<SourcePlatform, string> = {
  hye: 'hye', whatsapp: 'WhatsApp', telegram: 'Telegram', instagram: 'Instagram', messenger: 'Messenger', x: 'X', email: 'Email',
};
export const platformLabel = (p: SourcePlatform | 'web') => (p === 'web' ? 'Web' : PLATFORM_LABEL[p]);

/** Source identity for a conversation. Imported history is always labelled as such. */
export const SourceBadge = memo(function SourceBadge({ source, imported }: { source: SourcePlatform; imported?: boolean }) {
  const { colors } = useTheme();
  if (source === 'hye' && !imported) return null;
  const fg = imported ? colors.imported : colors.textMuted;
  return (
    <View style={[styles.badge, { backgroundColor: imported ? colors.importedSoft : colors.surfaceAlt }]}>
      <Ionicons name={imported ? 'archive-outline' : 'link-outline'} size={11} color={fg} />
      <Text style={[type.caption, { color: fg, fontWeight: '600' }]}>
        {imported ? `${platformLabel(source)} import` : platformLabel(source)}
      </Text>
    </View>
  );
});

export function Tag({ label, tone = 'muted' }: { label: string; tone?: 'muted' | 'accent' | 'warning' | 'success' | 'danger' }) {
  const { colors } = useTheme();
  const map = {
    muted: [colors.surfaceAlt, colors.textMuted], accent: [colors.accentSoft, colors.accent],
    warning: [colors.importedSoft, colors.imported], success: [colors.surfaceAlt, colors.success], danger: [colors.dangerSoft, colors.danger],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[type.caption, { color: fg, fontWeight: '600' }]}>{label}</Text>
    </View>
  );
}

const AVATAR_TINTS = ['#6366F1', '#0EA5E9', '#14B8A6', '#F59E0B', '#EC4899', '#8B5CF6', '#64748B'];
export const Avatar = memo(function Avatar({ name, size = 44, group }: { name: string; size?: number; group?: boolean }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join('') || '?';
  const tint = AVATAR_TINTS[[...name].reduce((n, ch) => n + ch.charCodeAt(0), 0) % AVATAR_TINTS.length];
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: tint, alignItems: 'center', justifyContent: 'center' }}
    >
      {group ? <Ionicons name="people" size={size * 0.48} color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: size * 0.38 }}>{initials}</Text>}
    </View>
  );
});

export function EmptyState({ icon, title, body, action }: { icon: IconName; title: string; body?: string; action?: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.accentSoft }]}>
        <Ionicons name={icon} size={28} color={colors.accent} />
      </View>
      <Txt variant="subheading" style={{ textAlign: 'center' }}>{title}</Txt>
      {body ? <Txt variant="small" color="textMuted" style={{ textAlign: 'center', maxWidth: 340 }}>{body}</Txt> : null}
      {action}
    </View>
  );
}

export function Banner({ icon, title, body, tone = 'info', action }: {
  icon: IconName; title: string; body?: string; tone?: 'info' | 'imported' | 'warning' | 'danger'; action?: ReactNode;
}) {
  const { colors } = useTheme();
  const [bg, fg] = {
    info: [colors.accentSoft, colors.accent], imported: [colors.importedSoft, colors.imported],
    warning: [colors.importedSoft, colors.warning], danger: [colors.dangerSoft, colors.danger],
  }[tone];
  return (
    <View accessibilityRole="summary" style={[styles.banner, { backgroundColor: bg }]}>
      <Ionicons name={icon} size={20} color={fg} style={{ marginTop: 1 }} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.small, { color: fg, fontWeight: '700' }]}>{title}</Text>
        {body ? <Txt variant="small" color="text">{body}</Txt> : null}
        {action}
      </View>
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const { colors } = useTheme();
  return <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, style]}>{children}</View>;
}

export function Row({ icon, label, detail, onPress, right, danger }: {
  icon?: IconName; label: string; detail?: string; onPress?: () => void; right?: ReactNode; danger?: boolean;
}) {
  const { colors } = useTheme();
  const body = (
    <>
      {icon ? <Ionicons name={icon} size={20} color={danger ? colors.danger : colors.textMuted} /> : null}
      <View style={{ flex: 1 }}>
        <Txt color={danger ? 'danger' : 'text'}>{label}</Txt>
        {detail ? <Txt variant="caption" color="textMuted">{detail}</Txt> : null}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} /> : null)}
    </>
  );
  return onPress ? (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceAlt }]}>
      {body}
    </Pressable>
  ) : (
    <View style={styles.row}>{body}</View>
  );
}

export function ToggleRow({ label, detail, value, onChange, icon }: { label: string; detail?: string; value: boolean; onChange: (v: boolean) => void; icon?: IconName }) {
  const { colors } = useTheme();
  return (
    <Row
      icon={icon}
      label={label}
      detail={detail}
      right={<Switch accessibilityLabel={label} value={value} onValueChange={onChange} trackColor={{ true: colors.accent, false: colors.border }} thumbColor="#fff" />}
    />
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Txt variant="caption" color="textMuted" style={{ textTransform: 'uppercase', letterSpacing: 0.6, marginTop: space.lg, marginBottom: space.xs, marginHorizontal: space.xs }}>{children}</Txt>;
}

export function Divider() {
  const { colors } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: space.lg }} />;
}

/** Confirmation dialog. Destructive actions always name exactly what will happen. */
export function ConfirmDialog({ visible, title, body, confirmLabel, destructive, onConfirm, onCancel, children, confirmDisabled }: {
  visible: boolean; title: string; body: string; confirmLabel: string; destructive?: boolean;
  onConfirm: () => void; onCancel: () => void; children?: ReactNode; confirmDisabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
        <View accessibilityViewIsModal style={[styles.dialog, { backgroundColor: colors.surface }]}>
          <Txt variant="heading">{title}</Txt>
          <Txt variant="small" color="textMuted">{body}</Txt>
          {children}
          <View style={styles.dialogActions}>
            <Button label="Cancel" variant="secondary" compact onPress={onCancel} />
            <Button label={confirmLabel} variant={destructive ? 'danger' : 'primary'} compact onPress={onConfirm} disabled={confirmDisabled} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** Bottom sheet style menu used for long-press actions. */
export function ActionSheet({ visible, title, actions, onClose, header }: {
  visible: boolean; title?: string; onClose: () => void; header?: ReactNode;
  actions: { label: string; icon: IconName; onPress: () => void; danger?: boolean; hidden?: boolean }[];
}) {
  const { colors } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable accessibilityLabel="Close menu" style={[styles.sheetOverlay, { backgroundColor: colors.overlay }]} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: colors.surface }]}>
          {title ? <Txt variant="subheading" style={{ paddingHorizontal: space.lg, paddingBottom: space.sm }}>{title}</Txt> : null}
          {header}
          {actions.filter(a => !a.hidden).map(a => (
            <Row key={a.label} icon={a.icon} label={a.label} danger={a.danger} right={<View />} onPress={() => { onClose(); a.onPress(); }} />
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export const styles = StyleSheet.create({
  button: { minHeight: 48, borderRadius: radius.md, paddingHorizontal: space.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  buttonCompact: { minHeight: 40, paddingHorizontal: space.md },
  iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  chip: { paddingHorizontal: space.md, height: 34, borderRadius: radius.pill, borderWidth: 1, justifyContent: 'center' },
  input: { minHeight: 48, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: space.md, fontSize: 16 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.sm, alignSelf: 'flex-start' },
  empty: { alignItems: 'center', justifyContent: 'center', padding: space.xxl, gap: space.md, flex: 1 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  banner: { flexDirection: 'row', gap: space.md, padding: space.md, borderRadius: radius.md },
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, minHeight: 56, paddingVertical: space.sm },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  dialog: { width: '100%', maxWidth: 420, borderRadius: radius.lg, padding: space.xl, gap: space.md },
  dialogActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.sm, marginTop: space.sm },
  sheetOverlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingTop: space.lg, paddingBottom: space.xxl, width: '100%', maxWidth: 560, alignSelf: 'center' },
});
