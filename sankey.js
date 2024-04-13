// Load the JSON file
d3.json("callouts_structure.json").then(function (graph) {
    const totalCalls = {};
    const receivedCalls = {};
    const nodeNames = {};

    // Create a mapping of node IDs to their names
    graph.nodes.forEach(node => {
        nodeNames[node.id] = node.name;
    });

    // Process each interruption to count calls made and received
    graph.interruptions.forEach(d => {
        totalCalls[d.caller] = (totalCalls[d.caller] || 0) + 1;
        if (d.speaker) {
            receivedCalls[d.speaker] = (receivedCalls[d.speaker] || 0) + 1;
        }
    });

    // Determine who made the most and who received the most calls using names
    let maxCaller = { name: null, count: 0 };
    let maxReceiver = { name: null, count: 0 };

    for (const [id, count] of Object.entries(totalCalls)) {
        if (count > maxCaller.count) {
            maxCaller = { name: nodeNames[id], count: count };
        }
    }

    for (const [id, count] of Object.entries(receivedCalls)) {
        if (count > maxReceiver.count) {
            maxReceiver = { name: nodeNames[id], count: count };
        }
    }

    // Update the first paragraph with the total number of calls and top participants using names
    const firstParagraph = document.querySelector('p.stats');
    firstParagraph.textContent += ` Insgesamt wurden ${Object.values(totalCalls).reduce((a, b) => a + b, 0)} Zwischenrufe erfasst. Die meisten Zwischenrufe tätigte ${maxCaller.name} mit ${maxCaller.count} Zwischenrufen, und der am häufigsten unterbrochene Sprecher war ${maxReceiver.name} mit ${maxReceiver.count} erhaltenen Zwischenrufen.`;

    const sessionOptions = new Set(graph.interruptions.map(d => d.session));
    const sessionSelect = document.getElementById('sessionSelect');
    sessionOptions.forEach(session => {
        const option = document.createElement('option');
        option.value = session;
        option.innerText = `${session}`;
        sessionSelect.appendChild(option);
    });

    function updateDiagram(selectedSession) {
        let enableInteraction = false;

        // Find the data for the selected session
        const sessionData = graph.interruptions.find(d => d.session === parseInt(selectedSession));
        const dateStr = sessionData.date;
        const dateObj = new Date(dateStr);
        // Locale-specific formatting
        const options = { day: 'numeric', month: 'long', year: 'numeric' };
        const formattedDate = dateObj.toLocaleDateString('de-DE', options);
        // Set the headline based on the selected session and append the formatted date
        document.getElementById('headline').textContent = `Protokollierte Zwischenrufe der ${selectedSession}. Nationalratssitzung am ${formattedDate}`;

        console.log("Updating for session:", selectedSession); // Debug log
        const filteredInterruptions = graph.interruptions.filter(d => d.session === parseInt(selectedSession));
        const involvedNodeIds = new Set(filteredInterruptions.flatMap(d => [d.caller, d.speaker]));


        // Aggregate total calls per caller and speaker
        const participantCounts = {}; // Use a single object for both caller and speaker
        filteredInterruptions.forEach(d => {
            participantCounts[d.caller] = (participantCounts[d.caller] || 0) + 1;
            participantCounts[d.speaker] = (participantCounts[d.speaker] || 0) + 1;
        });

        // Filter nodes to include only those involved in the selected session's interruptions
        let nodes = graph.nodes.filter(node => involvedNodeIds.has(node.id));

        // Sort nodes based on the total involvement (calls and interruptions)
        nodes.sort((a, b) => (participantCounts[b.id] || 0) - (participantCounts[a.id] || 0));

        // Map the old node IDs to their new indices
        const nodeIdToIndex = new Map(nodes.map((node, index) => [node.id, index]));

        // Initialize an object to hold aggregated interruptions
        const linkAggregates = {};

        // Aggregate interruptions by caller-speaker pairs
        filteredInterruptions.forEach(d => {
            const key = `${d.caller}-${d.speaker}`;
            if (!linkAggregates[key]) {
                linkAggregates[key] = { source: nodeIdToIndex.get(d.caller), target: nodeIdToIndex.get(d.speaker), value: 0 };
            }
            linkAggregates[key].value += 1;
        });

        // Convert the aggregates into an array format expected by the Sankey generator
        const links = Object.values(linkAggregates);

        const sankey = d3.sankey()
            .nodeWidth(15)
            .nodePadding(10)
            .extent([[margin.left, margin.top], [width, height]])
            .nodeSort(null)
            .linkSort((a, b) => b.value - a.value); // This sorts links based on their size;

        const { nodes: sankeyNodes, links: sankeyLinks } = sankey({
            nodes: nodes.map(d => ({ ...d })),
            links
        });

        d3.select("svg").selectAll("*").remove();

        const svg = d3.select("svg");


        svg.append("text")
            .attr("x", margin.left) // Position it near the left column
            .attr("y", margin.top - 10) // Position it above the top of the SVG for visibility
            .text("Getätigte Zwischenrufe") // The title for the left column
            .attr("class", "column-title"); // Assign a class for styling

        svg.append("text")
            .attr("x", width) // Position it near the right column, adjust as needed
            .attr("y", margin.top - 10) // Position it above the top of the SVG for visibility
            .text("Erhaltene Zwischenrufe") // The title for the right column
            .attr("class", "column-title") // Assign a class for styling
            .attr("text-anchor", "end"); // Ensure the text is right-aligned with the end of the column



        const link = svg.append("g")
            .selectAll(".link")
            .data(sankeyLinks)
            .enter().append("path")
            .attr("class", "sankey-link")
            .attr("d", d3.sankeyLinkHorizontal())
            .style("stroke-width", d => Math.max(1, d.width))
            .style("stroke", d => {
                const callerParty = sankeyNodes[d.source.index].party;
                return partyColors[callerParty];
            })
            // Setting the stroke-dasharray equal to the path length
            .attr("stroke-dasharray", function () {
                const length = this.getTotalLength();
                return `${length} ${length}`;
            })
            // Setting the stroke-dashoffset to the path length
            .attr("stroke-dashoffset", function () {
                return this.getTotalLength();
            })
            // Transition to animate the stroke-dashoffset to 0
            .transition()
            .duration(2000) // Duration of the animation in milliseconds
            .ease(d3.easeCubicInOut) // Applying an easing function
            .attr("stroke-dashoffset", 0)
            .on("end", () => {
                enableInteraction = true;
            });

        const node = svg.append("g")
            .selectAll(".node")
            .data(sankeyNodes)
            .enter().append("g")
            .attr("class", "sankey-node")

        node.on("mouseover", function (event, d) {
            if (!enableInteraction) return;

            // Adjust stroke-opacity for highlight effect and update text for all nodes
            svg.selectAll(".sankey-node").each(function (otherNode) {
                let textElement = d3.select(this).select("text.count");
                if (textElement.empty()) {
                    textElement = d3.select(this).append("text")
                        .attr("class", "count")
                        .attr("x", otherNode.x0 < width / 2 ? otherNode.x1 + 5 : otherNode.x0 - 5)
                        .attr("y", (otherNode.y1 + otherNode.y0) / 2)
                        .attr("dy", "0.35em")
                        .attr("text-anchor", otherNode.x0 < width / 2 ? "start" : "end")
                        .style("fill", "#555") // Choose a color that makes the text visible against your node colors
                        .style("fill", "#000") // Set text color to black
                        .style("stroke", "#fff") // Set text stroke to white
                        .style("stroke-width", "3px") // Set the stroke width (adjust as necessary)
                        .style("paint-order", "stroke"); // Ensure the stroke is painted before the fill, so it doesn't obscure the fill color
                }

                // Show counts for interactions
                if (d.id === otherNode.id) {
                    textElement.text(`${participantCounts[d.id]}`);
                } else {
                    // For each link, check if it matches the current mouseover node
                    const relatedLink = links.find(link =>
                        (link.source.id === d.id && link.target.id === otherNode.id) ||
                        (link.target.id === d.id && link.source.id === otherNode.id));
                    if (relatedLink) {
                        textElement.text(`${relatedLink.value}`);
                    } else {
                        textElement.text(""); // Clear the text if no direct relationship
                    }
                }
            });

            svg.selectAll(".sankey-link")
                .transition()
                .duration(300)
                .style("stroke-opacity", link => (link.source === d || link.target === d) ? 0.7 : 0.1);
        })
            .on("mouseout", function () {
                if (!enableInteraction) return;

                // Remove the count text on mouseout for all nodes
                svg.selectAll(".sankey-node").select("text.count").remove();

                // Reset all links to default low opacity without affecting their visibility
                svg.selectAll(".sankey-link")
                    .transition()
                    .duration(300)
                    .style("stroke-opacity", 0.1);
            });



        node.append("rect")
            .attr("x", d => d.x0)
            .attr("y", d => d.y0)
            .attr("height", d => d.y1 - d.y0)
            .attr("width", sankey.nodeWidth())
            .style("fill", d => partyColors[d.party])
            .style("stroke", d => partyColors[d.party])
            .append("title")
            .text(d => `${d.name}\n`);

        node.append("text")
            .attr("x", d => d.x0 < width / 2 ? d.x1 - 25 : d.x0 + 25)
            .attr("y", d => (d.y1 + d.y0) / 2)
            .attr("dy", "0.35em")
            .attr("text-anchor", d => d.x0 < width / 2 ? "end" : "start")
            .text(d => d.name);
    }

    // Set up the Sankey diagram
    const partyColors = {
        "FPÖ": "#000dff",
        "ÖVP": "#000000",
        "NEOS": "#fe019a",
        "GRÜNE": "#31ad00",
        "SPÖ": "#d41a0d",
        "": "#d3d3d3"
    };

    const svgElement = document.querySelector('svg');
    const svgWidth = svgElement.getBoundingClientRect().width;
    const svgHeight = svgElement.getBoundingClientRect().height;
    let margin = { top: 30, right: 0, bottom: 20, left: 170 },
        width = svgWidth - margin.left - margin.right,
        height = svgHeight - margin.top - margin.bottom;



    updateDiagram(sessionSelect.value);

    sessionSelect.addEventListener('change', (e) => updateDiagram(e.target.value));
});