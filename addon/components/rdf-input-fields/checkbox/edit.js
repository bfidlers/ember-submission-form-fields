import { action } from '@ember/object';
import { guidFor } from '@ember/object/internals';

import SimpleInputFieldComponent from '../simple-value-input-field';
import { triplesForPath } from '@lblod/submission-form-helpers';

export default class RdfInputFieldsCheckboxEditComponent extends SimpleInputFieldComponent {
  inputId = 'checkbox-' + guidFor(this);

  loadProvidedValue() {
    const matches = triplesForPath(this.storeOptions);
    if (matches.values.length > 0) {
      this.nodeValue = matches.values[0];
      this.value = matches.values[0].value === "1";
    }
  }

  @action
  updateValue(e) {
    this.value = e.target.checked;
    super.updateValue(this.value);
  }
}
