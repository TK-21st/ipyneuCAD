var widgets = require('@jupyter-widgets/base');
var _ = require('lodash');
var dat = require('../etc/dat.gui');

var Graph = require('graphology');
var Layout = require('graphology-library/layout');
var FA2Layout = require('graphology-layout-forceatlas2/worker');
var WebGLRenderer = require('sigma/renderers/webgl').default;

var falib = require('@fortawesome/fontawesome-svg-core');
var faSolid = require('@fortawesome/free-solid-svg-icons');
var faReg =  require('@fortawesome/free-regular-svg-icons');

falib.library.add(faReg.far, faSolid.fas)

// Kicks off the process of finding <i> tags and replacing with <svg>
falib.dom.watch()

var MUTED_COLOR = '#FBFBFB';
const AXONHILLOCK_COLOR = '#FF0000';
const SYNAPSE_COLOR = '#00FF00';
const RECEPTOR_COLOR = '#0000FF';
const PORT_COLOR = '#00AAAA';


const MAX_NODE_SIZE = 10;
const MIN_NODE_SIZE = 1;

function getFA2Settings(graph) {
  return {
      barnesHutOptimize: graph.order > 2000,
      strongGravityMode: true,
      gravity: 0.05,
      scalingRatio: 10,
      slowDown: 1 + Math.log(graph.order)
  };
}

/**
 * build Graphology Graph using networkx data
 * 
 * ## Note: we parse the following attributes
 * 1. `class`: model class of node
 * 2. `label`: label of node 
 * 3. `name` : name of node
 * 4. all other attributes are assumed to be model parameters
 * @param {Array<json>} data 
 */
function data2Graph(data, nodeSize='degree') {
  var graph = new Graph({type: data.directed ? 'directed': 'undirected'});
  data.nodes.forEach(function(node) {
      var key = node[0];
      var attrs = node[1];
      var name = key;
      var _class = attrs['class'];
      var nodeType = '';
      var color = '';
      if (_class.toLowerCase().indexOf('synapse') !== -1){
        nodeType = 'Synapse';
        color = SYNAPSE_COLOR;
      }else if (_class.toLowerCase().indexOf('receptor') !== -1){
        nodeType = 'Receptor';
        color = RECEPTOR_COLOR;
      }else if (_class.toLowerCase().indexOf('port') !== -1){
        nodeType = 'Port';
        color = PORT_COLOR;
      }else{
        nodeType = 'AxonHillock';
        color = AXONHILLOCK_COLOR;
      }

      if ('label' in attrs){
        delete attrs['label'];
      }
      if ('name' in attrs){
        name = attrs['name']; 
        delete attrs['name'];
      }


      graph.addNode(key, {
        type: nodeType,
        model:_class,
        x: Math.random(),
        y: Math.random(),
        z : 1,
        size: 2,
        viz: {},
        color: color,
        originalColor: color,
        label: name,
        modelParams: attrs  // all remaining attrs are assumed to be model params
      });
  });



  data.edges.forEach(function(edge) {
      var source = edge[0];
      var target = edge[1];
      var attrs = edge[2];

      attrs.z = 1;

      if (!attrs.viz)
          attrs.viz = {};

      if (!attrs.color) {
          attrs.color = '#CCC';
          attrs.originalColor = attrs.color;
      }

      if (data.directed){
        attrs.type = 'arrow'
      }      

      if (graph.hasEdge(source, target))
          graph.upgradeToMulti();

      graph.addEdge(source, target, attrs);
  });

  // changes sizes based on nodeSize
  var degrees = {};
  var maxDegree = 0;
  var minDegree = 100;
  var _degree = 0;
  graph.nodes().forEach(function(node){
    if (nodeSize ==='inDegree'){
      _degree = graph.inDegree(node);
    }else if (nodeSize ==='outDegree'){
      _degree = graph.outDegree(node);
    }else if (nodeSize ==='degree'){
      _degree = graph.degree(node);
    }
    degrees[node] = _degree
    maxDegree = (_degree > maxDegree)? _degree: maxDegree;
    minDegree = (_degree < minDegree)? _degree: minDegree;
  });

  graph.nodes().forEach(function(node){
    graph.setNodeAttribute(node,'size', MIN_NODE_SIZE+(MAX_NODE_SIZE-MIN_NODE_SIZE)*(degrees[node]-minDegree)/(maxDegree-minDegree));
  });
  
  return graph;
}


/**
 * convert graph to data format understood by the front end
 * 
 * ## Note: we parse the following attributes of each node
 * 1. `model`: model class of node
 * 2. `modelParams` : model parameters
 * @param {Graph} graph
 */
function graph2Data(graph) {
  var nodes = [];
  var edges = [];
  graph.nodes().forEach((node)=> {
    let attrs = graph.getNodeAttributes(node);
    let modelAttrs ={class: attrs.model};
    for (let key in attrs.modelParams){
      modelAttrs[key] = attrs.modelParams[key];
    }
    nodes.push([node, modelAttrs]);
  });

  graph.edges().forEach((edge)=> {
    let attrs = graph.getEdgeAttributes(edge);
    let target = graph.target(edge);
    let source = graph.source(edge);
    edges.push([source, target, attrs.id]);

  });
  
  return {nodes:nodes, edges:edges, directed:true};
}

// When serialiazing the entire widget state for embedding, only values that
// differ from the defaults will be specified.
var NeuCADModel = widgets.DOMWidgetModel.extend({
  defaults: _.extend(widgets.DOMWidgetModel.prototype.defaults(), {
    _model_name : 'NeuCADModel',
    _view_name : 'NeuCADView',
    _model_module : 'ipyneuCAD',
    _view_module : 'ipyneuCAD',
    _model_module_version : '0.1.0',
    _view_module_version : '0.1.0',
  })
});


// Custom View. Renders the widget model.
var NeuCADView = widgets.DOMWidgetView.extend({
  initialize: function() {
    this.renderSigma = this.renderSigma.bind(this);
    this.controlPanel = this.initControlPanel.bind(this);
  },

  render: function() {
      var height = this.model.get('height');
      var data = this.model.get('data');
      var nodeSize = this.model.get('nodeSize');

      this.graph = data2Graph(data,nodeSize);
      window.graph = this.graph;
      window.model = this.model;

      var el = this.el;
      el.style.height = height + 'px';

      var container = document.createElement('div');
      container.style.width = '100%';
      container.style.height = height + 'px';

      el.appendChild(container);

      this.container = container;

      let controlPanelDiv = document.createElement('div');
      controlPanelDiv.id = 'neucad-settings';
      controlPanelDiv.setAttribute("style", 'position:absolute; z-index:100');


      var datGUISettings = this.model.get('datGUISettings');
      this.controlPanel = this.initControlPanel(datGUISettings);
      controlPanelDiv.appendChild(this.controlPanel.domElement);

      this.container.appendChild(controlPanelDiv);
      this.dataChanged();

  },

  dataChanged: function() {
      requestAnimationFrame(this.renderSigma);
  },

  renderSigma: function() {
      var g = this.graph;

      this.renderer = new WebGLRenderer(g, this.container, {
          zIndex: true
      });
      this.camera = this.renderer.getCamera();

      var layoutAlg = this.model.get('layoutAlg')
      switch (layoutAlg) {
        case 'FA':
          this.layout = new FA2Layout(this.graph, {settings: getFA2Settings(this.graph)});
          break;
        
        case 'circular':
          console.warn('Circular Layout not currently supported, defaul to FA2');
          this.layout = new FA2Layout(this.graph, {settings: getFA2Settings(this.graph)});
          // this.layout = new Layout.circular(this.graph, {settings: defaultCircularLayoutSettings});
          break;
      
        case 'random':
          console.warn('Random Layout not currently supported, defaul to FA2');
          this.layout = new FA2Layout(this.graph, {settings: getFA2Settings(this.graph)});
          // this.layout = new Layout.circular(this.graph, {settings: defaultRandomLayoutSettings});
          break;
      
        default:
          break;
      }

      var highlightedNodes = new Set(),
          highlightedEdges = new Set();

      function highlightNode(h) {
          highlightedNodes.clear();
          highlightedEdges.clear();
          highlightedNodes.add(h);

          g.forEachNeighbor(h, function(neighbor) {
              highlightedNodes.add(neighbor);
          });

          g.forEachEdge(h, function(edge) {
              highlightedEdges.add(edge);
          });

          g.forEachNode(function(node, attrs) {
              if (highlightedNodes.has(node)) {
                  g.setNodeAttribute(node, 'color', attrs.originalColor);
                  g.setNodeAttribute(node, 'z', 1);
              }
              else {
                  g.setNodeAttribute(node, 'color', MUTED_COLOR);
                  g.setNodeAttribute(node, 'z', 0);
              }
          });

          g.forEachEdge(function(edge, attrs) {
              if (highlightedEdges.has(edge)) {
                  g.setEdgeAttribute(edge, 'color', attrs.originalColor);
                  g.setEdgeAttribute(edge, 'z', 1);
              }
              else {
                  g.setEdgeAttribute(edge, 'color', MUTED_COLOR);
                  g.setEdgeAttribute(edge, 'z', 0);
              }
          });
      }

      function unhighlightNode() {
          if (!highlightedNodes.size)
              return;

          highlightedNodes.clear();
          highlightedEdges.clear();

          g.forEachNode(function(node, attrs) {
              g.setNodeAttribute(node, 'color', attrs.originalColor);
              g.setNodeAttribute(node, 'z', 1);
          });

          g.forEachEdge(function(edge, attrs) {
              g.setEdgeAttribute(edge, 'color', attrs.originalColor);
              g.setEdgeAttribute(edge, 'z', 1);
          });
      }

      this.renderer.on('clickNode', (function(data) {
        var node = data.node;
        var attrs = this.graph.getNodeAttributes(node);
        this._showAttrs(attrs,node);
        highlightNode(node);
      }).bind(this));

      this.renderer.on('clickStage', (function() {
        this._showAttrs(null);
        unhighlightNode();
      }).bind(this));

      if (this.model.get('start_layout')){
        this.layoutBtn.__button.click();
      }
  },


  /**
   * show node attributes in dat.gui 'Node Attributes' folder
   * @param {json} attrs attributes of node in graph
   * @param {string|null} node name of the node
   */
  _showAttrs: function(attrs,node=null){
    var self = this;
    this.controlPanel.removeFolder(this.controlPanel.__folders['Node Attributes']);
    let folder = this.controlPanel.addFolder('Node Attributes');
    if (attrs === null ){
      return;
    }
    var _newtemp = function (key,value) {
      this[key] = value;
    };

    // Type and Model are read-only properties for now
    var _btn = folder.add(new _newtemp('Type',attrs.type),'Type');
    _btn.__li.style.pointerEvents = "none";
    _btn = folder.add(new _newtemp('Model',attrs.model),'Model');
    _btn.__li.style.pointerEvents = "none";

    for (let key in attrs.modelParams){
      let value = attrs.modelParams[key];
      if (isNaN(value)){
        continue;
      }

      let item = new _newtemp(key,value);
      let _btn = folder.add(item, key);
      _btn.onFinishChange(function(value){
        let newParams = attrs.modelParams;
        newParams[key] = value;
        self.graph.setNodeAttribute(node,'modelParams',newParams);
      });
    }

    folder.open();
  },


  initControlPanel: function(options={}){
    var self = this;
    let GUIOptions =  {
      autoPlace: (options.autoPlace) ? options.autoPlace : false, 
      resizable: (options.resizable) ? options.resizable : true, 
      scrollable: (options.scrollable) ? options.scrollable : true, 
      closeOnTop: (options.closeOnTop) ? options.closeOnTop : true, 
    };

    for (let key in options){
      if (!(key in GUIOptions)){
        GUIOptions[key] = options[key];
      }
    }

    var newButton = function (name, func) {
      this[name] = func;
    };

    let controlPanel = new dat.default.GUI(GUIOptions);

    // var _btn = new newButton('SyncData', () => {
    //   let newData = graph2Data(self.graph);
    //   self.model.set('data',newData);
    //   // self.touch();
    // });
    // controlPanel.add(_btn, 'SyncData').name('Synchronize Data to Backend');


    // node attributes are shown inside the gui under this folder
    var f1 = controlPanel.addFolder('Layout');

    _btn = new newButton('Layout', () => {
      if (self.layout && self.layout.running) {
        // $(".dg li[icon] svg.fa-circle-notch").removeClass('fa-spin');
        this.model.set('start_layout',false);
        // this.touch();
        self.layout.stop();
      }
      else {
        this.model.set('start_layout',true);
        // this.touch();
        // $(".dg li[icon] svg.fa-circle-notch").addClass('fa-spin');
        self.layout.start();
      }
    });


    f1.add(_btn, 'Layout').name('Toggle Layout');

    _btn = new newButton('Reset',() => { this.camera.animate({x: 0.5, y: 0.5, ratio: 1});});
    f1.add(_btn, 'Reset').name('Reset View');

  
    // node attributes are shown inside the gui under this folder
    controlPanel.addFolder('Node Attributes');
  
    controlPanel.open();
    
    return controlPanel;
  }
});


module.exports = {
  NeuCADModel : NeuCADModel,
  NeuCADView : NeuCADView
};



