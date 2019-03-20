import ipywidgets as widgets

from traitlets import Bool, Dict, Int, Unicode
from networkx import read_gexf

@widgets.register
class NeuCAD(widgets.DOMWidget):
    """
    NeuCAD IPyWidget
    """
    _view_name = Unicode('NeuCADView').tag(sync=True)
    _model_name = Unicode('NeuCADModel').tag(sync=True)
    _view_module = Unicode('ipyneuCAD').tag(sync=True)
    _model_module = Unicode('ipyneuCAD').tag(sync=True)
    _view_module_version = Unicode('^0.1.0').tag(sync=True)
    _model_module_version = Unicode('^0.1.0').tag(sync=True)

    layoutAlg = Unicode('FA').tag(sync=True)
    data = Dict({'nodes': [], 'edges': [], 'directed': True}).tag(sync=True)
    height = Int(500).tag(sync=True)
    start_layout = Bool(False).tag(sync=True)
    datGUISettings = Dict({'autoPlace': False, 'resizable': True, 'scrollable': False,'closeOnTop':True}).tag(sync=True)

    def __init__(self, graph, height=500, layout_alg='FA', start_layout=False, gui_setting={}, **kwargs):
        super(NeuCAD, self).__init__(**kwargs)

        self.layoutAlg = layout_alg

        if len(gui_setting)>0:
            for k in gui_setting:
                self.datGUISettings[k] = gui_setting[k]

        # populate graph
        nodes = list(graph.nodes(data=True))
        edges = list(graph.edges(data=True))

        self.data = {
            'nodes': nodes,
            'edges': edges,
            'directed': graph.is_directed()
        }

        self.height = height
        self.start_layout = start_layout

    @staticmethod
    def from_gexf(handle, *args, **kwargs):
        g = read_gexf(handle)

        return Sigma(g, *args, **kwargs)
