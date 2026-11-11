import { Button, Field, Input, MessageBar, MessageBarBody, Select, makeStyles, tokens } from '@fluentui/react-components';
import { observer } from 'mobx-react-lite';
import { appTokens } from '@/theme/appTokens';
import { useDialogStyles } from '@/components/useDialogStyles';
import type { AdjustmentEntryViewModel } from './AdjustmentEntryViewModel';
import { TAP_TARGET } from '@/components/sizes';

const useStyles = makeStyles({
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  // The two number boxes sit side by side on a phone; each is narrow enough for a few digits.
  numbers: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: tokens.spacingHorizontalM,
  },
  select: {
    width: '100%',
    maxWidth: 'none',
  },
  selectControl: {
    minHeight: TAP_TARGET,
  },
  preview: {
    margin: 0,
    color: appTokens.textMuted,
    overflowWrap: 'anywhere',
  },
  buttons: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: tokens.spacingHorizontalM,
  },
  button: {
    minHeight: TAP_TARGET,
    // "Remove −30" in a wide pack font must wrap rather than push the other button off a phone.
    overflowWrap: 'anywhere',
  },
});

/** Pick a team or a player, an amount and a multiplier; the buttons show the result they will apply. */
export const AdjustmentEntryForm = observer(function AdjustmentEntryForm({ vm }: { vm: AdjustmentEntryViewModel }) {
  const styles = useStyles();
  const dialogStyles = useDialogStyles();
  const { fieldErrors, formError, isSubmitting } = vm.form;

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        // Enter in a box adds, the common direction; Remove is always a deliberate tap.
        event.preventDefault();
        void vm.add();
      }}
    >
      <Field
        label="Team or player"
        validationMessage={fieldErrors.targetId}
        validationState={fieldErrors.targetId ? 'error' : 'none'}
        hint={vm.targetNote}
      >
        <Select
          className={styles.select}
          select={{ className: styles.selectControl }}
          value={vm.selectedTargetKey}
          onChange={(_, data) => vm.selectTarget(data.value)}
        >
          <option value="">Choose who gets the points</option>
          <optgroup label="Teams">
            {vm.teamTargets.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </optgroup>
          <optgroup label="Players">
            {vm.playerTargets.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </optgroup>
        </Select>
      </Field>

      <div className={styles.numbers}>
        <Field label="Points" validationMessage={fieldErrors.amount} validationState={fieldErrors.amount ? 'error' : 'none'}>
          <Input
            className={dialogStyles.input}
            value={vm.amount}
            inputMode="numeric"
            autoComplete="off"
            onChange={(_, data) => vm.setAmount(data.value)}
          />
        </Field>
        <Field
          label="Multiplier"
          validationMessage={fieldErrors.multiplier}
          validationState={fieldErrors.multiplier ? 'error' : 'none'}
        >
          <Input
            className={dialogStyles.input}
            value={vm.multiplier}
            inputMode="numeric"
            autoComplete="off"
            onChange={(_, data) => vm.setMultiplier(data.value)}
          />
        </Field>
      </div>

      <Field
        label="Reason (optional)"
        validationMessage={fieldErrors.reason}
        validationState={fieldErrors.reason ? 'error' : 'none'}
      >
        <Input
          className={dialogStyles.input}
          value={vm.reason}
          autoComplete="off"
          onChange={(_, data) => vm.setReason(data.value)}
        />
      </Field>

      {vm.previewLine !== undefined && <p className={styles.preview}>{vm.previewLine}</p>}

      {formError !== undefined && (
        <MessageBar intent="error">
          <MessageBarBody>{formError}</MessageBarBody>
        </MessageBar>
      )}
      {vm.lastResult !== undefined && (
        <MessageBar intent="success">
          <MessageBarBody>Saved: {vm.lastResult}</MessageBarBody>
        </MessageBar>
      )}

      <div className={styles.buttons}>
        <Button className={styles.button} appearance="primary" disabled={isSubmitting} onClick={() => void vm.add()}>
          {vm.addLabel}
        </Button>
        <Button className={styles.button} disabled={isSubmitting} onClick={() => void vm.remove()}>
          {vm.removeLabel}
        </Button>
      </div>
    </form>
  );
});
