import { action } from '@ember/object';
import { guidFor } from '@ember/object/internals';
import SimpleInputFieldComponent from '../simple-value-input-field';

export default class FormInputFieldsTextAreaEditComponent extends SimpleInputFieldComponent {
  inputId = 'textarea-' + guidFor(this);

  @action
  updateValue(e) {
    if (e && typeof e.preventDefault === "function")
      e.preventDefault();
    super.updateValue(this.value && this.value.trim());
  }
}
