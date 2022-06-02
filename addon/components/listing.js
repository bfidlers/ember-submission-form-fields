import { A } from '@ember/array';
import { action } from '@ember/object';
import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { FORM, generatorsForNode, SHACL, triplesForGenerator, triplesForScope } from '@lblod/submission-form-helpers';
import rdflib from 'browser-rdflib';
import { v4 as uuidv4 } from 'uuid';
import { getSubFormsForNode } from '../utils/model-factory';

export default class ListingComponent extends Component {
  @tracked subForms = A();
  @tracked creationFormData = null;
  newEntriesPath = {};
  scope = null;

  get formStore() {
    return this.args.formStore;
  }

  get graphs() {
    return this.args.graphs;
  }

  get sourceNode() {
    return this.args.sourceNode;
  }

  get listing() {
    return this.args.listing;
  }

  constructor() {
    super(...arguments);
    this.updateScope();
    this.renderSubForms();
    this.setNewEntriesPath();
  }

  @action
  createEntry() {
    //TODO: now only one entry can be created at the same time (complicates a lot)
    const createGraph = new rdflib.NamedNode(`http://data.lblod.info/createForm/${uuidv4()}`);
    const dataset = this.runGenerator();
    dataset.triples = dataset.triples.map(t => { return { ...t, graph: createGraph }; });
    this.formStore.addAll(dataset.triples);

    const sourceNode = dataset.sourceNodes[0];
    const creationForm = getSubFormsForNode({
      store: this.formStore,
      graphs: this.graphs,
      node: this.listing.uri,
      sourceNode
    }, FORM('new'))[0];

    this.creationFormData =
      {
        graphs: {
          fromGraph: this.graphs.formGraph,
          sourceGraph: createGraph,
          metaGraph: this.graphs.metaGraph
        },
        sourceNode,
        formStore: this.formStore,
        form: creationForm
      };
  }

  @action
  cancelCreateEntry( formData ) {
    let triples = formData.formStore.match(undefined, undefined, undefined, formData.graphs.sourceGraph);
    this.creationFormData = null;
    this.formStore.removeStatements(triples);
  }

  @action
  saveEntry( formData ) {
    let triples = formData.formStore.match(undefined, undefined, undefined, formData.graphs.sourceGraph);
    const triplesToInsert = [
      ...this.attachSourceNodes([ formData.sourceNode ]),
      ...triples.map(t => { return { ...t, graph: this.graphs.sourceGraph }; })
    ];
    this.formStore.addAll(triplesToInsert);
    this.updateScope();
    this.renderSubForms();
    this.creationFormData = null;
    this.formStore.removeStatements(triples);
  }

  @action
  removeEntry( entrySourceNode ) {
    // TODO: this is a simplified version and will result in dangling triples
    //  - We need a proper spec in the model on how to define a delete pattern
    //  - We could be more aggressive (i.e. delete all ?s ?p ?o) but might risk deleting too much (and breaking the data)
    const triples = [];
    if(!this.newEntriesPath.inverse) {
      triples.push({
        subject: this.sourceNode,
        predicate: this.newEntriesPath.pathSegment,
        object: entrySourceNode,
        graph: this.graphs.sourceGraph
      });
    }
    else {
      triples.push({
        subject: entrySourceNode,
        predicate: this.newEntriesPath.pathSegment,
        object: this.sourceNode,
        graph: this.graphs.sourceGraph
      });
    }
    this.formStore.removeStatements(triples);
    this.updateScope();
    this.renderSubForms();
  }

  setNewEntriesPath() {
    const path = this.formStore.any(this.listing.rdflibScope, SHACL("path"), undefined, this.graphs.formGraph);
    let pathSegment = path;
    if(pathSegment.termType === "Collection") {
      pathSegment = pathSegment.elements[0];
    }

    if (pathSegment.termType == "NamedNode") {
      this.newEntriesPath = { pathSegment: pathSegment };
    }
    else {
      const inversePath = this.formStore.any(pathSegment, SHACL("inversePath"), undefined, this.graphs.formGraph);
      this.newEntriesPath = { pathSegment: inversePath, inverse: true };
    }
  }

  updateScope() {
    this.scope = triplesForScope(
      this.listing.rdflibScope,
      {
        store: this.formStore,
        formGrah: this.graphs.formGraph,
        sourceNode: this.sourceNode,
        sourceGraph: this.graphs.sourceGraph
      }
    );
  }

  renderSubForms() {
    let subForms = [];

    //This is a simplified version of rendering the subforms. It misses the following:
    // - TODO: ordering of hasMany
    // - TODO: a listing might have multiple subforms; where different info can be respresented
    // - TODO: there is currently no specific 'create' form
    // Note further:
    // - The rendering procedure might be similar to property-group; but is not the same.
    //   Given that it might get even more complex; I think we need to wait before abstracting this away.
    for (const sourceNode of this.scope.values) {
      const subForm = getSubFormsForNode({
        store: this.formStore,
        graphs: this.graphs,
        node: this.listing.uri,
        sourceNode
      })[0];

      if(subForm)
        subForms.push(subForm);
    }

    // 2) calculate to be removed
    const deletes = this.subForms.filter(
      (rendered) => !subForms.find((child) => child.sourceNode.equals(rendered.sourceNode))
    );

    // 3) remove the "unwanted" children
    if (deletes.length) {
      this.subForms.removeObjects(deletes);
    }

    // 4) create a new list to render, merging already (rendered) children, with new children.
    // We don't want to re-render components, to avoid flickering behaviour and state loss.
    const mergedChildren = A();

    for (const child of subForms) {
      const existingField = this.subForms.find((eField) =>
        eField.sourceNode.equals(child.sourceNode)
      );
      if (existingField) {
        mergedChildren.pushObject(existingField);
      } else {
        mergedChildren.pushObject(child);
      }
    }

    this.subForms = mergedChildren;
  }

  runGenerator() {
    const generators = generatorsForNode(this.listing.uri,
                                         { store: this.formStore, formGraph: this.graphs.formGraph });

    let fullDataset = { sourceNodes: [], triples: [] };
    for(const generator of generators.createGenerators) {
      const dataset = triplesForGenerator(generator,
                                          { store: this.formStore, formGraph: this.graphs.formGraph });

      fullDataset.sourceNodes = [ ...fullDataset.sourceNodes, ...dataset.sourceNodes ];
      fullDataset.triples = [ ...fullDataset.triples, ...dataset.triples ];
    }

    return fullDataset;
  }

  attachSourceNodes( sourceNodes ) {
    //TODO: probably this type of boilerplate should be residing elsewhere
    const allSourceNodes = [];
    const { pathSegment, inverse }  = this.newEntriesPath;
    if(inverse){
      for(const targetNode of sourceNodes) {
        allSourceNodes.push({
          subject: targetNode,
          predicate: pathSegment,
          object: this.sourceNode,
          graph: this.graphs.sourceGraph
        });
      }
    }
    else {
      for(const targetNode of sourceNodes) {
        allSourceNodes.push({
          subject: this.sourceNode,
          predicate: pathSegment,
          object: targetNode,
          graph: this.graphs.sourceGraph
        });
      }
    }
    return allSourceNodes;
  }

  sourceForHasManyConnection() {
    //It assumes >= 1 of ordered segement data.
    const lastSegementData = this.scope.orderedSegmentData.slice(-1)[0];

    //TODO: this assumes the source of the hasMany relation is singular.
    // However, it could be that multiple nodes on a path are the source of the hasMany
    // Let's not support this for now.
    const sourceData = { sourceNode: {}, ...lastSegementData };

    if(this.scope.orderedSegmentData.length == 1) {
      sourceData.sourceNode = this.sourceNode;
    }
    else {
      const penUltimatePathElement = this.scope.orderedSegmentData.slice(-2)[0];
      const values = penUltimatePathElement.values;
      if(values.length == 0){
        throw `No penultimate hop found. It is not clear how we should support this.
               Try form:generator to prepare default data`;
      }
      else if(values.length > 1){
        throw `Many source nodes not supported for a hasMany relation`;
      }
      else {
        sourceData.sourceNode = values[0];
      }
    }

    return sourceData;
  }

}
