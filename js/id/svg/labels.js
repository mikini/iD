iD.svg.Labels = function(projection) {

    // Replace with dict and iterate over entities tags instead?
    var label_stack = [
        ['line', 'highway', ''],
        ['area', 'building', 'yes'],
        ['area', 'leisure', 'park'],
        ['area', 'natural', '']
    ];

    var pointOffsets = [
        [25, 3, 'start'], // right
        [-15, 3, 'end'], // left
    ];

    var height = 12,
        width = 6;

    function drawLineLabels(group, labels, filter, classes, position) {

        var reverse = position('reverse');

        var texts = group.selectAll('text.' + classes)
            .filter(filter)
            .data(labels, iD.Entity.key);

        var tp = texts.enter()
            .append('text')
            .attr({ 'class': classes})
            .append('textPath')
            .attr({
                'class': 'textpath',
                'startOffset': '50%'
            });

        var tps = group.selectAll('.textpath-label .textpath')
            .data(labels)
            .attr({
                'xlink:href': function(d, i) { return '#casing-' + d.id},
                'glyph-orientation-vertical': function(d, i) {return reverse(d, i) ? 180 : 0}, 
                'glyph-orientation-horizontal': function(d, i) {return reverse(d, i) ? 180 : 0},
                'dominant-baseline': 'central'
            })
            .text(function(d, i) {
                return reverse(d, i) ? d.tags.name.split('').reverse().join('') : d.tags.name;
            });

        texts.exit().remove();

    }

    function drawPointLabels(group, labels, filter, classes, position) {
        var texts = group.selectAll('text.' + classes)
            .filter(filter)
            .data(labels, iD.Entity.key);

        texts.enter()
            .append('text')
            .attr('class', classes);

        texts.attr('x', position('x'))
            .attr('y', position('y'))
            .attr('transform', position('transform'))
            .style('text-anchor', position('textAnchor'))
            .text(function(d) { return d.tags.name });

        texts.exit().remove();
        return texts;
    }

    function reverse(p) {
        var angle = Math.atan2(p[1][1] - p[0][1], p[1][0] - p[0][0]),
            reverse = !(p[0][0] < p[p.length - 1][0] && angle < Math.PI/2 && angle > - Math.PI/2);
        return reverse;
    }

    function subpath(nodes, from, to) {
        function segmentLength(i) {
            var dx = nodes[i][0] - nodes[i + 1][0];
            var dy = nodes[i][1] - nodes[i + 1][1];
            return Math.sqrt(dx * dx + dy * dy);
        }

        var sofar = 0,
            start, end, i0, i1;
        for (var i = 0; i < nodes.length - 1; i++) {
            var current = segmentLength(i);
            if (!start && sofar + current > from) {
                var portion = (from - sofar) / current;
                start = [
                    nodes[i][0] + portion * (nodes[i + 1][0] - nodes[i][0]),
                    nodes[i][1] + portion * (nodes[i + 1][1] - nodes[i][1])
                ];
                i0 = i + 1;
            }
            if (!end && sofar + current > to) {
                var portion = (to - sofar) / current;
                end = [
                    nodes[i][0] + portion * (nodes[i + 1][0] - nodes[i][0]),
                    nodes[i][1] + portion * (nodes[i + 1][1] - nodes[i][1])
                ];
                i1 = i;
            }
            sofar += current;

        }
        var ret = nodes.slice(i0, i1);
        ret.unshift(start);
        ret.push(end);
        return ret;

    }


    return function drawLabels(surface, graph, entities, filter) {

        var rtree = new RTree();

        var labelable = [];
        for (var i = 0; i < label_stack.length; i++) labelable.push([]);

        for (var i = 0; i < entities.length; i++) {
            var entity = entities[i];
            if (!entity.tags.name) continue;
            for (var k = 0; k < label_stack.length; k ++) {
                if (entity.geometry() === label_stack[k][0] &&
                    entity.tags[label_stack[k][1]] && !entity.tags[label_stack[k][2]]) {
                    labelable[k].push(entity);
                    break;
                }
            }
        }


        var positions = {
            point: [],
            line: [],
            area: []
        };

        var labelled = {
            point: [],
            line: [],
            area: []
        };

        labelable = _.flatten(labelable);

        for (var i = 0; i < labelable.length; i ++) {
            var entity = labelable[i],
                p;
            if (entity.geometry() === 'point') {
                p = getPointLabel(entity);
            } else if (entity.geometry() === 'line') {
                p = getLineLabel(entity);
            } else if (entity.geometry() === 'area') {
                p = getAreaLabel(entity);
            }
            if (p) {
                positions[entity.geometry()].push(p);
                labelled[entity.geometry()].push(entity);
            }
        }

        function getPointLabel(entity) {
            var coord = projection(entity.loc),
                offset = pointOffsets[0],
                p = {},
                w = width * entity.tags.name.length;
            p.x = coord[0] + offset[0];
            p.y = coord[1] + offset[1];
            p.textAnchor = offset[2];
            var rect = new RTree.Rectangle(p.x, p.y, w, 20);
            if (tryInsert(rect)) return p;
        }

        function getLineLabel(entity) {
            var nodes = _.pluck(entity.nodes, 'loc').map(projection),
                length = iD.util.geo.pathLength(nodes),
                w = width * entity.tags.name.length;
            if (length < w + 20) return;

            var ends = (length - w) / 2,
                sub = subpath(nodes, ends, length - ends),
                rev = reverse(sub),
                rect = new RTree.Rectangle(
                Math.min(sub[0][0], sub[sub.length - 1][0]) - 5,
                Math.min(sub[0][1], sub[sub.length - 1][1]) - 5,
                Math.abs(sub[0][0] - sub[sub.length - 1][0]) + 10,
                Math.abs(sub[0][1] - sub[sub.length - 1][1]) + 10
            );
            if (tryInsert(rect)) return {
                reverse: rev
            };
        }

        function getAreaLabel(entity) {
            var nodes = _.pluck(entity.nodes, 'loc')
                .map(iD.svg.RoundProjection(projection)),
                centroid = iD.util.geo.polygonCentroid(nodes),
                extent = entity.extent(graph),
                entitywidth = projection(extent[1])[0] - projection(extent[0])[0],
                w = width * entity.tags.name.length;
                p = {};

            if (entitywidth < w + 20) return;
            p.x = centroid[0];
            p.y = centroid[1];
            p.textAnchor = 'middle';
            var rect = new RTree.Rectangle(p.x - w/2, p.y, w, 20);
            if (tryInsert(rect)) return p;

        }

        function tryInsert(rect) {
            var v = rtree.search(rect, true).length === 0;
            if (v) rtree.insert(rect);
            return v;
        }

        function pointposition(attr) {
            return function(d, i) { return positions['point'][i][attr] };
        }
        function lineposition(attr) {
            return function(d, i) { return positions['line'][i][attr] };
        }
        function areaposition(attr) {
            return function(d, i) { return positions['area'][i][attr] };
        }


        var label = surface.select('.layer-label'),
            points = drawPointLabels(label, labelled['point'], filter, 'text-label', pointposition),
            lines = drawLineLabels(label, labelled['line'], filter, 'textpath-label', lineposition),
            areas = drawPointLabels(label, labelled['area'], filter, 'text-arealabel', areaposition);
    };

};
