// Card rules text, shared by the browser UI (window.CardText) and the asset generator (require).
(function (root) {
  const DEV = {
    knight: 'Move the robber and steal 1 card. Counts toward Largest Army.',
    road_building: 'Build 2 roads for free.',
    year_of_plenty: 'Take any 2 resources from the bank.',
    monopoly: 'Name a resource; every player gives you all of theirs.',
    vp: '1 victory point (kept hidden; counts automatically).',
  };
  const PROGRESS = {
    alchemy: 'Before rolling: choose the red and yellow dice results.',
    crane: 'Build 1 city improvement for 1 commodity less.',
    engineering: 'Build 1 city wall for free.',
    invention: 'Swap 2 number discs (not 2, 6, 8 or 12).',
    irrigation: 'Take 2 wheat for each field next to your buildings.',
    medicine: 'Upgrade a settlement to a city for 1 wheat + 2 ore.',
    mining: 'Take 2 ore for each mountain next to your buildings.',
    road_building: 'Build 2 roads for free.',
    smithing: 'Promote up to 2 knights for free.',
    commercial_harbor: 'Give each opponent 1 resource; each gives you 1 commodity of their choice.',
    guild_dues: 'Take 2 cards of your choice from a player with more VP.',
    merchant: 'Place the merchant next to your building: 2:1 for that hex\'s resource and 1 VP.',
    merchant_fleet: 'Pick a card type: trade it 2:1 with the bank this turn.',
    resource_monopoly: 'Name a resource: each player gives you up to 2.',
    trade_monopoly: 'Name a commodity: each player gives you 1.',
    diplomacy: 'Remove an open road (your own: rebuild it for free).',
    encouragement: 'Activate all your knights for free.',
    espionage: 'Look at a player\'s progress cards and take 1.',
    intrigue: 'Displace an opponent\'s knight on your route.',
    sabotage: 'Players with as many or more VP discard half their cards.',
    taxation: 'Move the robber and steal 1 card from every player there.',
    treason: 'A player removes a knight; you may place one of equal or lower level.',
    wedding: 'Each player with more VP gives you 2 cards of their choice.',
    printing: '+1 victory point. Played face up at once; it can\'t be taken.',
    constitution: '+1 victory point. Played face up at once; it can\'t be taken.',
  };
  const TITLE = (id) => String(id).replace(/_/g, ' ').toUpperCase();
  const api = { DEV, PROGRESS, TITLE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CardText = api;
})(this);
