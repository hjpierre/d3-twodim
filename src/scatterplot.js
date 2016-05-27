export default function(dispatch) {
  // 'global' declarations go here
  var rendering = 'svg';
  var scatterData = [];
  var scatterDataKey = undefined;
  var localDispatch = d3.dispatch('mouseover', 'mouseout');
  
  var width = 1;
  var height = 1;
  var xValue = function(d) { return +d[0]; };
  var yValue = function(d) { return +d[1]; };
  var scale = { x: undefined, y: undefined };
  var name = ["", ""];
  
  var grpValue = null;
  var foundGroups = ["undefined"];
  
  var ptSize = 3;
  var colorScale = null;
  var ptIdentifier = function(d, i) { return i; };
  
  var doBrush = false;
  var doVoronoi = false;
  var brush = undefined;
  var voronoi = undefined;
  
  var duration = 500;
  
  // the shared scales/groups needed by all rendering mechanisms
  function setGlobals(data) {
    // set the discovered groups
      foundGroups = grpValue == null ? ["undefined"] : d3.set(data.map(function(e) { return grpValue(e); })).values();
      colorScale = colorScale || d3.scale.category10();
      colorScale.domain(foundGroups);
      console.log("found %d groups", foundGroups.length);
      dispatch.groupUpdate(foundGroups, colorScale);
      
      // set the axes' domain
      var xd = d3.extent(data, function(e) { return +xValue(e); });
      var yd = d3.extent(data, function(e) { return +yValue(e); });
      scale.x = d3.scale.linear()
        .domain(xd).range([0, width]);
      scale.y = d3.scale.linear()
        .domain(yd).range([height, 0]);
  };
  
  function redrawSVG(selection) {
    console.log("called scatterplot.redrawSVG()");
    selection.each(function(data, i) {
      var g = d3.select(this);
      
      // set the scales and determine the groups and their colors
      setGlobals(data);
      
      // construct a brush object for this selection 
      // (TODO / BUG: one brush for multiple graphs?)
      brush = d3.svg.brush()
        .x(scale.x)
        .y(scale.y)
        .on("brush", brushmove)
        .on("brushend", brushend);
      
      // draw axes first so points can go over the axes
      var xaxis = g.selectAll('g.xaxis')
        .data([0]);
      
      // add axis if it doesn't exist  
      xaxis.enter()
        .append('g')
          .attr('class', 'xaxis axis')
          .attr('transform', 'translate(0, ' + height + ')')
          .call(d3.svg.axis().orient("bottom").scale(scale.x));
          
      // update axis if x-bounds changed
      xaxis.transition()
        .duration(duration)
        .attr('transform', 'translate(0, ' + height + ')')
        .call(d3.svg.axis().orient("bottom").scale(scale.x));
        
      var xLabel = xaxis.selectAll('text.alabel')
        .data([name[0]]);
        
      xLabel.enter().append('text')
        .attr('class', 'alabel')
        .attr('transform', 'translate(' + (width / 2) + ',20)')
        .attr('dy', '1em')
        .style('text-anchor', 'middle');
      xLabel.text(function(d) { return d; });
      xLabel.exit().remove();
        
      var yaxis = g.selectAll('g.yaxis')
        .data([0]);
        
      // add axis if it doesn't exist
      yaxis.enter()
        .append('g')
          .attr('class', 'yaxis axis')
          .call(d3.svg.axis().orient("left").scale(scale.y));
          
      // update axis if y-bounds changed
      yaxis.transition()
        .duration(duration)
        .call(d3.svg.axis().orient("left").scale(scale.y));
        
      var yLabel = yaxis.selectAll('text.alabel')
        .data([name[1]]);
      yLabel.enter().append('text')
        .attr('class', 'alabel')
        .attr('transform', 'rotate(-90)')
        .attr('y', -25)
        .attr('x', -(height / 2))
        .attr('dy', '-1em')
        .style('text-anchor', 'middle');
      yLabel.text(function(d) { return d; });
      yLabel.exit().remove();
      
      // put the brush above the points to allow hover events; see 
      //   <http://wrobstory.github.io/2013/11/D3-brush-and-tooltip.html>
      //   and <http://bl.ocks.org/wrobstory/7612013> ..., but still have
      //   issues: <http://bl.ocks.org/yelper/d38ddf461a0175ebd927946d15140947>
      // RESOLVED: <http://stackoverflow.com/questions/37354411/>
      // create the brush group if it doesn't exist and is requested by `doBrush`
      var brushDirty = false;
      if (doBrush) {
        // this will have no effect if brush elements are already in place
        g.call(brush);
      } else {
        // remove all traces of the brush and deactivate events
        brushDirty = true;
        g.style('pointer-events', null)
          .style('-webkit-tap-highlight-color', null);
        g.selectAll('.background, .extent, .resize').remove();
        g.on('mousedown.brush', null)
          .on('touchstart.brush', null);
      }
      
      // create a group for the circles if it doesn't yet exist  
      g.selectAll('g.circles')
        .data([1]).enter().append('g')
          .attr('class', 'circles');
          
      // bind points to circles
      var points = g.select('g.circles').selectAll('circle.point')
        .data(data, ptIdentifier);
        
      points.enter().append('circle')
        .attr("class", "point")
        .attr('id', function(d) { return "circle-" + d.orig_index; })
        .attr('r', ptSize)
        .attr('cx', function(e) { return scale.x(xValue(e)); })
        .attr('cy', function(e) { return scale.y(yValue(e)); })
        .style('fill', grpValue ? function(d) { return colorScale(grpValue(d)); } : colorScale('undefined'))
        .style('opacity', 1)
        .on('mouseover', doVoronoi ? null : function(d) {
          var ptPos = this.getBoundingClientRect();
          localDispatch.mouseover(d, ptPos);
        })
        .on('mouseout',  doVoronoi ? null : localDispatch.mouseout)
        .on('mousedown', function(d) {
          // if a brush is started over a point, hand it off to the brush
          // HACK from <http://stackoverflow.com/questions/37354411/>
          if (doBrush) {
            var e = brush.extent();
            var m = d3.mouse(g.node());
            var p = [scale.x.invert(m[0]), scale.y.invert(m[1])];
            
            if (brush.empty() || e[0][0] > xValue(d) || xValue(d) > e[1][0] ||
              e[0][1] > yValue(d) || yValue(d) > e[1][1])
            {
               brush.extent([p,p]);
            } else {
              d3.select(this).classed('extent', true);
            }
          }
        });
        
      points.transition()
        .duration(duration)
        .attr('cx', function(e) { return scale.x(xValue(e)); })
        .attr('cy', function(e) { return scale.y(yValue(e)); })
        .style('fill', grpValue ? function(d) { return colorScale(grpValue(d)); } : colorScale('undefined'))
        .style('opacity', 1);
        
      points.exit().transition()
        .duration(duration)
        .style('opacity', 1e-6)
        .remove();
        
      // hack to clear selected points post-hoc after removing brush element 
      // (to get around inifinite-loop problem if called from within the exit() selection)
      if (brushDirty) dispatch.highlight(false);
      
      // deal with setting up the voronoi group
      var voronoiGroup = g.selectAll('g.voronoi')
        .data(doVoronoi ? [0] : []);
      voronoiGroup.enter().append('g')
        .attr('class', 'voronoi');
      voronoiGroup.exit()
        .each(localDispatch.mouseout)
        .remove();
      
      if (doVoronoi) {
        voronoi = d3.geom.voronoi()
          .x(function(d) { return scale.x(xValue(d)); })
          .y(function(d) { return scale.y(yValue(d)); })
          .clipExtent([[0, 0], [width, height]]);
      }
        
      function brushmove(p) {
        var e = brush.extent();
        g.selectAll("circle").classed("hidden", function(d, i) {
          if (e[0][0] > xValue(d) || xValue(d) > e[1][0] || e[0][1] > yValue(d) || yValue(d) > e[1][1])
            return true;
            
          return false; 
        });
        
        g.selectAll('circle').classed('extent', false);
        g.selectAll('.voronoi path').classed('extent', false);
        
        dispatch.highlight(function(d) { 
          return !(e[0][0] > xValue(d) || xValue(d) > e[1][0] || e[0][1] > yValue(d) || yValue(d) > e[1][1]);
        });
      }
      
      function brushend() {
        if (brush.empty()) {
          // destroy any remaining voronoi shapes
          g.selectAll('.voronoi').selectAll('path').remove();
          
          // destroys any lingering extent rectangles 
          // (can happen when passing mousemoves through voronoi layer)
          g.selectAll('.extent').attr('width', 0).attr('height', 0);
          
          // call any linked mouseout events to finalize brush removals
          // (e.g. hides tooltips when brush disappears and no highlighted points remain)
          localDispatch.mouseout();
          
          // removes all highlights for all linked components 
          g.selectAll('.hidden').classed('hidden', false);
          dispatch.highlight(false);
        }
      }
    });
  };
  
  function redrawCanvas(selection) {
    console.log("called scatterplot.redrawCanvas()");
    selection.each(function(data, i) {
      // only support points so far
      var canvas = d3.select(this);
      setGlobals(data);
      
      if (!canvas.node().getContext){
        console.error("Your browser does not support the 2D canvas element; reverting to SVG");
        rendering = 'svg';
        redrawSVG();
      }
      
      data = data.concat(data).concat(data).concat(data).concat(data);
      
      var ctx = canvas.node().getContext('2d');
      ctx.clearRect(0, 0, width, height);
      
      // /* draw the points sequentially */
      // for (var i = 0; i < data.length * 100; i++) {
      //   var d = data[i % data.length];
      //   var x = scale.x(xValue(d)), y = scale.y(yValue(d));
        
      //   ctx.fillStyle = colorScale(grpValue(d));
      //   ctx.beginPath();
      //   ctx.moveTo(x, y);
      //   ctx.arc(x, y, ptSize, 0, 2 * Math.PI);
      //   ctx.fill();
      // };
      
      // draw the points 
      renderPoints(data, ctx);
      
    });
    
    // inspired by <http://bl.ocks.org/syntagmatic/2420080>
    function renderPoints(points, ctx, rate) {
      var n = points.length;
      var i = 0;
      rate = rate || 250;
      ctx.clearRect(0, 0, width, height);
      function render() {
        var max = Math.min(i + rate, n);
        points.slice(i, max).forEach(function(d) { 
          renderPoint(
            ctx, scale.x(xValue(d)), 
            scale.y(yValue(d)), colorScale(grpValue(d)));
        });
        i = max;
      };
      
      (function animloop() {
        if (i >= n) return;
        requestAnimationFrame(animloop);
        render();
      })();
    }
    
    function renderPoint(ctx, x, y, color) {
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.moveTo(x, y);
      ctx.arc(x, y, ptSize, 0, 2 * Math.PI);
      ctx.fill();
    }
  };
  
  function scatterplot(selection, name) {
    selection.each(function(d, i) {
      var g = d3.select(this);
      g.data([scatterData], scatterDataKey);
    });
    
    switch (rendering) {
      case 'svg':
        redrawSVG(selection);
        break;
      case 'canvas':
        redrawCanvas(selection);
        break;
      case 'webgl': 
        throw "webgl scatterplot not implemented";
        redrawWebGL(selection);
        break;
    }
    
    dispatch.on('highlight.' + name, function(selector) {
      // console.log("scatterplot dispatch called for " + name + "!");
      
      var allPoints = selection.selectAll('circle');
      if (typeof selector === "function") {
        allPoints.classed('hidden', true);
        allPoints.filter(selector).classed('hidden', false);
        
        // generate relevant voronoi
        if (doVoronoi) {
          selection.selectAll('g.voronoi').selectAll('path').remove();
          selection.selectAll('g.voronoi').selectAll('path')
            .data(voronoi(scatterData.filter(selector)))
            .enter().append('path')
            .attr('d', function(d) { 
              return "M" + d.join('L') + "Z"; 
            })
            .datum(function(d, i) { return d.point; })
            .attr('class', function(d,i) { return "voronoi-" + d.orig_index; })
            // .style('stroke', '#2074A0')
            .style('fill', 'none')
            .style('pointer-events', 'all')
            .on('mouseover', function(d) {
              var pt = d3.select("#circle-" + d.orig_index);
              var ptPos = pt.node().getBoundingClientRect();
              // d3.select(this).style('fill', '#2074A0');
              localDispatch.mouseover(d, ptPos);
            }).on('mouseout', function(d) {
              // d3.select(this).style('fill', 'none');
              localDispatch.mouseout(d);
            }).on('mousedown', function(d) {
              // if a brush is started over a point, hand it off to the brush
              // HACK from <http://stackoverflow.com/questions/37354411/>
              if (doBrush) {
                var e = brush.extent();
                var m = d3.mouse(selection.node());
                var p = [scale.x.invert(m[0]), scale.y.invert(m[1])];
                
                if (brush.empty() || e[0][0] > p[0] || p[0] > e[1][0] ||
                  e[0][1] > p[1] || p[1] > e[1][1])
                {
                  brush.extent([p,p]);
                } else {
                  d3.select(this).classed('extent', true);
                }
              }
            });
        }
        
        // reorder points to bring highlighted points to the front
        allPoints.sort(function(a, b) {
          if (selector(a)) {
            if (selector(b))
              return 0;
            else
              return 1;
          } else {
            if (selector(b))
              return -1;
            else
              return 0;
          }
        });
      } else if (!selector) {
        allPoints.classed('hidden', false);
        allPoints.sort(function(a,b) { return d3.ascending(a.orig_index, b.orig_index); });
        
        if (doVoronoi) {
          selection.selectAll('g.voronoi').selectAll('path').remove();
        }
      }
    });
  }
  
  /**
   * Gets or sets the data bound to points in the scatterplot.  Following D3.js convention, this should be an array of anonymous objects.  Generally set all at once by the twoDFactory.setData() method
   * @default Empty array: []
   * @param {Object[]} The data of the scatterplot.  Set the `.x()` and `.y()` accessors for the x- and y-dimensions of the scatterplot
   * @param {function(Object[]): string} The key function for the data (similar to the key function in `d3.data([data, [key]])`)
   */
  scatterplot.data = function(newData, key) {
    if (!arguments.length) return scatterData;
    scatterData = newData;
    
    // add original index value (this could be randomized)
    scatterData.forEach(function(d, i) {
      d['orig_index'] = i;
    });
    
    if (key)
      scatterDataKey = key;
    
    return scatterplot;
  };
  
  /**
   * Gets or sets the type of rendering mechanism.  One of "svg", "canvas", or "webgl".  Subsequent calls of `scatterplot` on a selection will populate the selections with the given rendering type
   */
  scatterplot.renderType = function(renderType) {
    if (!arguments.length) return rendering;
    if (['svg', 'canvas', 'webgl'].indexOf(renderType) == -1)
      throw "Expected value of 'svg', 'canvas', or 'webgl' to scatterplot.renderType";
    rendering = renderType;
    return scatterplot;
  }
  
  /**
   * The width of the constructed scatterplot.  The caller is responsible for maintaining sensible margins.
   * @default 1 (pixel)
   * @param {number} [val] - Sets the width of the scatterplot to the given value (in pixels).
   */ 
  scatterplot.width = function(val) {
    if (!arguments.length) return width;
    width = val;
    return scatterplot;
  };
  
  /**
   * The height of the constructed scatterplot.  The caller is responsible for maintaining sensible margins.
   * @default 1 (pixel)
   * @param {number} [val] - Sets the height of the scatterplot to the given value (in pixels).
   */
  scatterplot.height = function(val) {
    if (!arguments.length) return height;
    height = val;
    return scatterplot;
  }
  
  /**
   * The function to select the x-value from the datapoint
   * @default Function selects the first value in the datum (e.g. d[0])
   * @param {function(): number} [xVal] - The function that returns the x-axis value for a given point
   */
  scatterplot.x = function(xVal) {
    if (!arguments.length) return xValue;
    xValue = xVal;
    return scatterplot;
  }
  
  /**
   * The function to select the y-value from the datapoint
   * @default Function select the second value in the datum (e.g. d[1])
   * @param {function(): number} [yVal] - The function that returns the y-axis value for a given point
   */
  scatterplot.y = function(yVal) {
    if (!arguments.length) return yValue;
    yValue = yVal;
    return scatterplot;
  }
  
  /**
   * Sets the x-axis label for the scatterplot.
   * @default Blank value; no axis label is drawn.
   * @param {string} [xName] - The text that describes the x-axis
   */
  scatterplot.xLabel = function(xName) {
    if (!arguments.length) return name[0];
    name[0] = xName;
    return scatterplot;
  }
  
  /**
   * Sets the y-axis label for the scatterplot
   * @default Blank value; no axis label is drawn
   * @param {string} [yName] - The text that describes the y-axis
   */
  scatterplot.yLabel = function(yName) {
    if (!arguments.length) return name[1];
    name[1] = yName; 
    return scatterplot;
  }
  
  /**
   * Sets the x- and y-axis labels for the scatterplot at the same time, given an array of two strings.
   * @default Blank value; no axis label is drawn for both axes
   * @param {string[]} [names] - Array of labels to describe the x- and y-axis, respectively 
   */
  scatterplot.labels = function(names) {
    if (!arguments.length) return name; 
    if (names.length != 2) throw "Expected an array of length two for scatterplot.labels: [xLabel, yLabel]"
    name = names;
    return scatterplot;
  }
  
  /**
   * Convenience method to set the field for the x-dimension (given the row is an object and not an array), and co-occurrently sets the xLabel
   * @default Function that selects the value for the x-dimension (e.g. d[0])
   * @param {string} [xField] - The field from which to read the continuous value for the x-dimension
   */
  scatterplot.xField = function(xField) {
    if (!arguments.length) return name[0];
    name[0] = xField;
    xValue = function(d) { return d[xField]; };
    return scatterplot; 
  }
  
  /**
   * Convenience method to set the field for the y-dimension (given the row is an object and not an array), and co-occurrently sets the yLabel
   * @default Function that selects the value for the y-dimension (e.g. d[0])
   * @param {string} [yField] - The field from which to read the continuous value for the y-dimension
   */
  scatterplot.yField = function(yField) {
    if (!arguments.length) return name[1];
    name[1] = yField;
    yValue = function(d) { return d[yField]; };
    return scatterplot;
  }
  
  /**
   * Convenience method to set fields for both dimensions (given that rows are objects and not arrays), and co-occurrently sets the labels for the two dimensions
   * @default Blank values for axis labels
   * @param {string[]} [fields] - Array of fields for the x- and y-axis, respectively
   */
  scatterplot.fields = function(fields) {
    if (!arguments.length) return name;
    if (fields.length != 2) throw "Expected an array of length two for scatterplot.fields: [xField, yField]";
    name = fields;
    xValue = function(d) { return d[name[0]]; };
    yValue = function(d) { return d[name[1]]; };
    return scatterplot;
  }
  
  /**
   * The size of the scatterplot marks
   * @default 3 (pixels)
   * @param {number} [newSize] - The new scatterplot mark size
   */
  scatterplot.circleSize = function(newSize) {
    if (!arguments.length) return ptSize;
    ptSize = newSize;
    return scatterplot; 
  }
  
  /**
   * Gets or sets the duration of animated transitions (in milliseconds) when updating the scatterplot bounds, axes, or point locations
   * @default Transitions have a duration of 500ms
   * @param {number} [newDuration] - The new duration of all animated transitions.
   */
  scatterplot.changeDuration = function(newDuration) {
    if (!arguments.length) return duration;
    duration = newDuration;
    return scatterplot;
  }
  
  /**
   * Pass in a custom function to uniquely identify a point (so it can be updated)
   * @default Uses the index of the point in the list of points (d3's default for key-less data)
   * @param {function()} [newIDFunc] - A function that returns a unique indentifier for a given point 
   */
  scatterplot.pointIdentifier = function(newIDFunc) {
    if (!arguments.length) return ptIdentifier;
    ptIdentifier = newIDFunc;
    return scatterplot;
  }
  
  /**
   * The function to select the grouping value from the datapoint
   * @default No function, meaning that all points are considered to be from the same series
   * @param {function(Object): string} [grpVal] - The function that returns the group identifier for a given point
   */
  scatterplot.groupColumn = function(grpVal) {
    if (!arguments.length) return grpVal;
    grpValue = grpVal;
    return scatterplot;
  }
  
  /**
   * The color scale to map to the grouping column. The domain of the colorscale will be set at draw time from the current data.
   * @default Uses the `d3.scale.category10() color scale.
   * @param {d3.scale.ordinal(): string} [newScale] - The new `d3.scale.ordinal()` scale to use.
   */
  scatterplot.colorScale = function(newScale) {
    if (!arguments.length) return colorScale;
    colorScale = newScale;
    return scatterplot;
  }
  
  /**
   * Tells the scatterplot to support a D3 brush component.  
   * Points not selected by the brush will have the `.hidden` CSS class selector added.
   * @default false (no brush will be added to the scatterplot)
   * @param {boolean} [newBrush] Whether or not to add a brush to the scatterplot.
   */
  scatterplot.doBrush = function(newBrush) {
    if (!arguments.length) return doBrush;
    doBrush = newBrush;
    return scatterplot;
  }
  
  /**
   * Tells the scatterplot to generate a voronoi based on the highlighted points (helpful for binding hover events to)
   * @default false (no voronoi will be generated when points are highlighted)
   * @param {boolean} [newVoronoi] - Whether or not to update a voronoi diagram based on highlighted points
   */
  scatterplot.doVoronoi = function(newVoronoi) {
    if (!arguments.length) return doVoronoi;
    doVoronoi = newVoronoi;
    return scatterplot;
  }
  
  return d3.rebind(scatterplot, localDispatch, 'on');
};
