var ipyneuCAD = require('./index');
var base = require('@jupyter-widgets/base');

module.exports = {
  id: 'ipyneuCAD',
  requires: [base.IJupyterWidgetRegistry],
  activate: function(app, widgets) {
      widgets.registerWidget({
          name: 'ipyneuCAD',
          version: ipyneuCAD.version,
          exports: ipyneuCAD
      });
  },
  autoStart: true
};

