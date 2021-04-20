import Component from '@glimmer/component';
import rdflib from 'browser-rdflib';
import { v4 as uuidv4 } from 'uuid';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { next } from '@ember/runloop';

import { RDF, XSD } from '@lblod/submission-form-helpers';

const MU = new rdflib.Namespace('http://mu.semte.ch/vocabularies/core/');

const extBaseUri = 'http://mu.semte.ch/vocabularies/ext/';
const climateTableBaseUri = 'http://data.lblod.info/climate-tables';

const tableEntryBaseUri = 'http://data.lblod.info/id/climate-table/row-entry';
const ClimateEntryType = new rdflib.NamedNode(`${extBaseUri}ClimateEntry`);
const climateEntryPredicate = new rdflib.NamedNode(`${extBaseUri}climateEntry`);
const actionDescriptionPredicate = new rdflib.NamedNode(`${extBaseUri}actionDescription`);
const amountPerActionPredicate = new rdflib.NamedNode(`${extBaseUri}amountPerAction`);
const restitutionPredicate = new rdflib.NamedNode(`${extBaseUri}restitution`);
const hasInvalidRowPredicate = new rdflib.NamedNode(`${climateTableBaseUri}/hasInvalidClimateTableEntry`);
const toRealiseUnitsPredicate = new rdflib.NamedNode(`${extBaseUri}toRealiseUnits`);
const costPerUnitPredicate = new rdflib.NamedNode(`${extBaseUri}costPerUnit`);

export default class CustomSubsidyFormFieldsClimateSubsidyCostsTableTableRowWerfComponent extends Component {
  @tracked tableEntryUri = null;
  @tracked amount = null;
  @tracked restitution = null;
  @tracked toRealiseUnits = null;
  @tracked costPerUnit = null;
  @tracked errors = [];
  @tracked isValidRow = true;

  get storeOptions() {
    return this.args.storeOptions;
  }

  get businessRuleUri() {
    return new rdflib.NamedNode(this.args.businessRuleUriStr);
  }

  get climateTableSubject() {
    return this.args.climateTableSubject;
  }

  get defaultCostPerUnit() {
    const businessRuleMapping  = {
      'http://data.lblod.info/id/subsidies/rules/384b2567-ab54-4b6f-b19c-a438829b3666': { cost: 150 }
    };

    return businessRuleMapping[this.businessRuleUri.value].cost;
  }

  get onUpdateRow(){
    return this.args.onUpdateRow;
  }

  constructor() {
    super(...arguments);
   //next for technical reasons
    next(this, () => {
      if (this.hasValues()) {
        this.loadProvidedValue();
        this.args.updateTotalRestitution(this.restitution);
        this.onUpdateRow();
      }
      else {
        this.initializeDefault();
      }
    });
  }

  hasValues() {
    const values = this.storeOptions.store.match(null, actionDescriptionPredicate, this.businessRuleUri, this.storeOptions.sourceGraph);
    return values.length;
  }

  loadProvidedValue() {
    const values = this.storeOptions.store.match(null, actionDescriptionPredicate, this.businessRuleUri, this.storeOptions.sourceGraph);
    if (values.length > 1) {
      throw `Expected single value for ${this.businessRuleUri}`;
    }
    else {
      this.setComponentValues(values[0].subject);
    }
  }

  setComponentValues(subject) {
    this.tableEntryUri = subject;
    this.amount = this.storeOptions.store.match(this.tableEntryUri, amountPerActionPredicate, null, this.storeOptions.sourceGraph)[0].object.value;
    this.costPerUnit = this.storeOptions.store.match(this.tableEntryUri, costPerUnitPredicate, null, this.storeOptions.sourceGraph)[0].object.value;
    this.restitution = this.storeOptions.store.match(this.tableEntryUri, restitutionPredicate, null, this.storeOptions.sourceGraph)[0].object.value;
    this.toRealiseUnits = this.storeOptions.store.match(this.tableEntryUri, toRealiseUnitsPredicate, null, this.storeOptions.sourceGraph)[0].object.value;
  }

  initializeDefault() {
    const uuid = uuidv4();
    const tableEntryUri = new rdflib.NamedNode(`${tableEntryBaseUri}/${uuid}`);

    let triples = [
      {
        subject: tableEntryUri,
        predicate: RDF('type'),
        object: ClimateEntryType,
        graph: this.storeOptions.sourceGraph
      },
      {
        subject: tableEntryUri,
        predicate: MU('uuid'),
        object: uuid,
        graph: this.storeOptions.sourceGraph
      },
      {
        subject: this.climateTableSubject,
        predicate: climateEntryPredicate,
        object: tableEntryUri,
        graph: this.storeOptions.sourceGraph
      },
      {
        subject: tableEntryUri,
        predicate: actionDescriptionPredicate,
        object: this.businessRuleUri,
        graph: this.storeOptions.sourceGraph
      }
    ];

    triples.push(
      {
        subject: tableEntryUri,
        predicate: costPerUnitPredicate,
        object: this.defaultCostPerUnit,
        graph: this.storeOptions.sourceGraph
      }
    );

    triples.push(
      {
        subject: tableEntryUri,
        predicate: amountPerActionPredicate,
        object: 0,
        graph: this.storeOptions.sourceGraph
      }
    );

    triples.push(
      {
        subject: tableEntryUri,
        predicate: restitutionPredicate,
        object: 0,
        graph: this.storeOptions.sourceGraph
      }
    );

    triples.push(
      {
        subject: tableEntryUri,
        predicate: toRealiseUnitsPredicate,
        object: 0,
        graph: this.storeOptions.sourceGraph
      }
    );

    this.storeOptions.store.addAll(triples);
    this.setComponentValues(tableEntryUri);
  }

  updateTripleObject(subject, predicate, newObject = null) {
    const triples = this.storeOptions.store.match(
      subject,
      predicate,
      undefined,
      this.storeOptions.sourceGraph
    );

    this.storeOptions.store.removeStatements([...triples]);

    if (newObject) {
      this.storeOptions.store.addAll([
        {
          subject: subject,
          predicate: predicate,
          object: newObject,
          graph: this.storeOptions.sourceGraph
        }
      ]);
    }
  }

  isValid(toRealiseUnits){
    this.errors = [];

    if (!this.isPositiveInteger(toRealiseUnits)) {
      this.errors.pushObject({
        message: 'Aantal items moeten groter of gelijk aan 0 zijn.'
      });
      this.updateTripleObject(this.climateTableSubject, hasInvalidRowPredicate, this.tableEntryUri);
      return false;
    }

    else if (!this.isValidInteger(toRealiseUnits)) {
      this.errors.pushObject({
        message: 'Aantal items moeten een geheel getal vormen.'
      });
      this.updateTripleObject(this.climateTableSubject, hasInvalidRowPredicate, this.tableEntryUri);
      return false;
    }

    //OpstartTraject lokale energiegemeentschap
    else if (toRealiseUnits > 1 &&
             'http://data.lblod.info/id/subsidies/rules/38d6d2bd-e42b-4d7e-8fea-9a371d9cf22f' == this.businessRuleUri.value) {
      this.errors.pushObject({
        message: 'Er is maximaal 1 realiseren item mogelijk voor deze actie.'
      });
      this.updateTripleObject(this.climateTableSubject, hasInvalidRowPredicate, this.tableEntryUri);
      return false;
    }
    else {
      this.updateTripleObject(this.climateTableSubject, hasInvalidRowPredicate, null);
      return true;
    }
  }

  isPositiveInteger(value) {
    return parseInt(value) >= 0;
  }

  isValidInteger(value) {
    return parseFloat(value) % 1 === 0;
  }

  @action
  update(e) {
    if (e && typeof e.preventDefault === "function") e.preventDefault();

    if(!this.isValid(this.toRealiseUnits)){
      return this.onUpdateRow();
    }

    const parsedToRealiseUnits = Number(this.toRealiseUnits);
    const amount = this.costPerUnit * parsedToRealiseUnits;
    const currentRestitution = this.restitution;
    const newRestitution  = amount / 2;

    this.updateTripleObject(this.tableEntryUri, toRealiseUnitsPredicate, rdflib.literal(parsedToRealiseUnits, XSD('integer')));
    this.updateTripleObject(this.tableEntryUri, amountPerActionPredicate, rdflib.literal(amount, XSD('integer')));
    this.updateTripleObject(this.tableEntryUri, restitutionPredicate, rdflib.literal(newRestitution, XSD('float')));
    this.setComponentValues(this.tableEntryUri);

    // Updates the "Terugtrekkingsrecht te verdelen" value
    this.args.updateTotalRestitution(newRestitution - currentRestitution);
    return this.onUpdateRow();
  }
}
