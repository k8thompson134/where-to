const request = require('supertest');

// Mock the Anthropic SDK before requiring server
const mockCreate = jest.fn();
jest.mock('@anthropic-ai/sdk', () => {
    return jest.fn().mockImplementation(() => ({
        messages: {
            create: mockCreate
        }
    }));
});

const { app, extractJsonArray } = require('./server');

describe('Server API', () => {
    beforeEach(() => {
        mockCreate.mockReset();
    });

    describe('GET /api/health', () => {
        it('returns ok status', async () => {
            const res = await request(app).get('/api/health');
            expect(res.status).toBe(200);
            expect(res.body).toEqual({ status: 'ok' });
        });
    });

    describe('POST /api/filter-places', () => {
        it('returns empty array for empty places', async () => {
            const res = await request(app)
                .post('/api/filter-places')
                .send({ userQuery: 'coffee', places: [] });

            expect(res.status).toBe(200);
            expect(res.body.filteredIndices).toEqual([]);
        });

        it('returns empty array for missing places', async () => {
            const res = await request(app)
                .post('/api/filter-places')
                .send({ userQuery: 'coffee' });

            expect(res.status).toBe(200);
            expect(res.body.filteredIndices).toEqual([]);
        });

        it('filters places using Claude and returns indices', async () => {
            mockCreate.mockResolvedValue({
                content: [{ text: '[0, 2, 4]' }]
            });

            const places = [
                { name: 'Starbucks', types: ['cafe'] },
                { name: 'Panera Bread', types: ['restaurant'] },
                { name: 'Colectivo Coffee', types: ['cafe'] },
                { name: 'McDonalds', types: ['restaurant'] },
                { name: 'Stone Creek Coffee', types: ['cafe'] }
            ];

            const res = await request(app)
                .post('/api/filter-places')
                .send({ userQuery: 'coffee', places });

            expect(res.status).toBe(200);
            expect(res.body.filteredIndices).toEqual([0, 2, 4]);
        });

        it('extracts JSON from Claude response with explanation text', async () => {
            mockCreate.mockResolvedValue({
                content: [{ text: 'Based on the rules, here are the matches:\n\n[1, 3]\n\nThese are coffee shops.' }]
            });

            const places = [
                { name: 'Panera', types: ['restaurant'] },
                { name: 'Starbucks', types: ['cafe'] },
                { name: 'Tool Shed', types: ['store'] },
                { name: 'Colectivo', types: ['cafe'] }
            ];

            const res = await request(app)
                .post('/api/filter-places')
                .send({ userQuery: 'coffee', places });

            expect(res.status).toBe(200);
            expect(res.body.filteredIndices).toEqual([1, 3]);
        });

        it('returns all indices on Claude error', async () => {
            mockCreate.mockRejectedValue(new Error('API error'));

            const places = [
                { name: 'Starbucks', types: ['cafe'] },
                { name: 'Colectivo', types: ['cafe'] }
            ];

            const res = await request(app)
                .post('/api/filter-places')
                .send({ userQuery: 'coffee', places });

            expect(res.status).toBe(200);
            expect(res.body.filteredIndices).toEqual([0, 1]);
            expect(res.body.error).toBe('API error');
        });

        it('returns empty array when Claude returns no JSON', async () => {
            mockCreate.mockResolvedValue({
                content: [{ text: 'I cannot filter these results.' }]
            });

            const places = [
                { name: 'Starbucks', types: ['cafe'] }
            ];

            const res = await request(app)
                .post('/api/filter-places')
                .send({ userQuery: 'coffee', places });

            expect(res.status).toBe(200);
            expect(res.body.filteredIndices).toEqual([]);
        });
    });
});

// ============================================================
// EDGE CASE TESTS: Confusing Place Types
// These test scenarios where similar-sounding places need disambiguation
// ============================================================

describe('Edge Cases: Coffee vs Cafe vs Restaurant', () => {
    beforeEach(() => {
        mockCreate.mockReset();
    });

    it('distinguishes coffee shops from restaurants that serve coffee', async () => {
        mockCreate.mockResolvedValue({
            content: [{ text: '[0, 3, 5]' }]
        });

        const places = [
            { name: 'Starbucks', types: ['cafe', 'food'] },
            { name: 'Denny\'s', types: ['restaurant', 'food'] },  // serves coffee but is a diner
            { name: 'IHOP', types: ['restaurant', 'food'] },       // serves coffee but is a restaurant
            { name: 'Dunkin Donuts', types: ['cafe', 'bakery'] },
            { name: 'Cracker Barrel', types: ['restaurant', 'store'] }, // serves coffee
            { name: 'Peet\'s Coffee', types: ['cafe'] }
        ];

        const res = await request(app)
            .post('/api/filter-places')
            .send({ userQuery: 'coffee', places });

        expect(res.status).toBe(200);
        // Should pick actual coffee shops, not breakfast restaurants
        expect(mockCreate).toHaveBeenCalledWith(
            expect.objectContaining({
                messages: expect.arrayContaining([
                    expect.objectContaining({
                        content: expect.stringContaining('coffee')
                    })
                ])
            })
        );
    });

    it('handles cafe-bookstore hybrids for coffee query', async () => {
        mockCreate.mockResolvedValue({
            content: [{ text: '[1, 3]' }]
        });

        const places = [
            { name: 'Barnes & Noble', types: ['book_store', 'cafe'] },  // has Starbucks inside
            { name: 'Colectivo Coffee', types: ['cafe'] },
            { name: 'Powell\'s Books', types: ['book_store'] },         // might have coffee
            { name: 'Coffee & Books Cafe', types: ['cafe', 'book_store'] }
        ];

        const res = await request(app)
            .post('/api/filter-places')
            .send({ userQuery: 'coffee', places });

        expect(res.status).toBe(200);
    });

    it('distinguishes coffee shops from convenience stores selling coffee', async () => {
        mockCreate.mockResolvedValue({
            content: [{ text: '[2, 4]' }]
        });

        const places = [
            { name: '7-Eleven', types: ['convenience_store', 'gas_station'] },
            { name: 'Kwik Trip', types: ['convenience_store', 'gas_station'] },
            { name: 'Starbucks', types: ['cafe'] },
            { name: 'Speedway', types: ['gas_station', 'convenience_store'] },
            { name: 'Caribou Coffee', types: ['cafe'] }
        ];

        const res = await request(app)
            .post('/api/filter-places')
            .send({ userQuery: 'coffee shop', places });

        expect(res.status).toBe(200);
    });

    it('handles bakeries with coffee service', async () => {
        mockCreate.mockResolvedValue({
            content: [{ text: '[0, 2]' }]
        });

        const places = [
            { name: 'Starbucks', types: ['cafe'] },
            { name: 'Panera Bread', types: ['bakery', 'cafe', 'restaurant'] },  // ambiguous
            { name: 'Blue Bottle Coffee', types: ['cafe'] },
            { name: 'Corner Bakery Cafe', types: ['bakery', 'restaurant'] }     // more restaurant
        ];

        const res = await request(app)
            .post('/api/filter-places')
            .send({ userQuery: 'coffee', places });

        expect(res.status).toBe(200);
    });
});

describe('Edge Cases: Craft Store vs Hardware Store vs Hobby Shop', () => {
    beforeEach(() => {
        mockCreate.mockReset();
    });

    it('distinguishes craft stores from hardware stores', async () => {
        mockCreate.mockResolvedValue({
            content: [{ text: '[0, 2, 4]' }]
        });

        const places = [
            { name: 'Michaels', types: ['store', 'home_goods_store'] },
            { name: 'Home Depot', types: ['hardware_store', 'store'] },
            { name: 'Joann Fabrics', types: ['store', 'home_goods_store'] },
            { name: 'Ace Hardware', types: ['hardware_store'] },
            { name: 'Hobby Lobby', types: ['store', 'home_goods_store'] },
            { name: 'Menards', types: ['hardware_store', 'store'] }  // has craft section
        ];

        const res = await request(app)
            .post('/api/filter-places')
            .send({ userQuery: 'craft store', places });

        expect(res.status).toBe(200);
    });

    it('handles stores with misleading names', async () => {
        mockCreate.mockResolvedValue({
            content: [{ text: '[1, 3]' }]
        });

        const places = [
            { name: 'The Craft House', types: ['bar', 'restaurant'] },      // craft BEER
            { name: 'Blick Art Materials', types: ['store'] },
            { name: 'Craft Beer Cellar', types: ['liquor_store'] },         // craft BEER
            { name: 'A.C. Moore Arts & Crafts', types: ['store'] },
            { name: 'Craft Brewers Guild', types: ['establishment'] }       // craft BEER
        ];

        const res = await request(app)
            .post('/api/filter-places')
            .send({ userQuery: 'craft store', places });

        expect(res.status).toBe(200);
    });

    it('distinguishes art supply from general craft stores', async () => {
        mockCreate.mockResolvedValue({
            content: [{ text: '[0, 1, 3]' }]
        });

        const places = [
            { name: 'Blick Art Materials', types: ['store'] },
            { name: 'Utrecht Art Supplies', types: ['store'] },
            { name: 'Dollar Tree', types: ['store'] },                       // has some craft items
            { name: 'Artist & Craftsman Supply', types: ['store'] },
            { name: 'Five Below', types: ['store'] }                         // has some craft items
        ];

        const res = await request(app)
            .post('/api/filter-places')
            .send({ userQuery: 'art supplies', places });

        expect(res.status).toBe(200);
    });

    it('excludes adult stores with craft-like names', async () => {
        mockCreate.mockResolvedValue({
            content: [{ text: '[0, 2]' }]
        });

        const places = [
            { name: 'Michaels', types: ['store'] },
            { name: 'Lovers Lane', types: ['store'] },                       // adult store
            { name: 'Hobby Lobby', types: ['store'] },
            { name: 'Pure Romance', types: ['store'] }                       // adult store
        ];

        const res = await request(app)
            .post('/api/filter-places')
            .send({ userQuery: 'craft store', places });

        expect(res.status).toBe(200);
    });

    it('handles fabric vs general craft store queries', async () => {
        mockCreate.mockResolvedValue({
            content: [{ text: '[0, 2]' }]
        });

        const places = [
            { name: 'Joann Fabrics', types: ['store', 'home_goods_store'] },
            { name: 'Michaels', types: ['store'] },                          // some fabric
            { name: 'Fabric Depot', types: ['store'] },
            { name: 'Hobby Lobby', types: ['store'] }                        // some fabric
        ];

        const res = await request(app)
            .post('/api/filter-places')
            .send({ userQuery: 'fabric store', places });

        expect(res.status).toBe(200);
    });
});

describe('Edge Cases: Grocery vs Convenience vs Specialty Food', () => {
    beforeEach(() => {
        mockCreate.mockReset();
    });

    it('distinguishes grocery stores from convenience stores', async () => {
        mockCreate.mockResolvedValue({
            content: [{ text: '[0, 2, 4]' }]
        });

        const places = [
            { name: 'Kroger', types: ['grocery_or_supermarket', 'store'] },
            { name: '7-Eleven', types: ['convenience_store'] },
            { name: 'Whole Foods', types: ['grocery_or_supermarket', 'store'] },
            { name: 'Walgreens', types: ['pharmacy', 'convenience_store'] },
            { name: 'Trader Joe\'s', types: ['grocery_or_supermarket'] },
            { name: 'CVS', types: ['pharmacy', 'store'] }
        ];

        const res = await request(app)
            .post('/api/filter-places')
            .send({ userQuery: 'grocery store', places });

        expect(res.status).toBe(200);
    });

    it('handles warehouse clubs for grocery queries', async () => {
        mockCreate.mockResolvedValue({
            content: [{ text: '[0, 1, 2, 3]' }]  // Could include Costco as it sells groceries
        });

        const places = [
            { name: 'Costco', types: ['store', 'grocery_or_supermarket'] },
            { name: 'Aldi', types: ['grocery_or_supermarket'] },
            { name: 'Sam\'s Club', types: ['store'] },
            { name: 'Walmart Supercenter', types: ['department_store', 'grocery_or_supermarket'] },
            { name: 'Target', types: ['department_store'] }  // has groceries but not primary
        ];

        const res = await request(app)
            .post('/api/filter-places')
            .send({ userQuery: 'grocery', places });

        expect(res.status).toBe(200);
    });

    it('handles ethnic/specialty grocery stores', async () => {
        mockCreate.mockResolvedValue({
            content: [{ text: '[0, 1, 2, 3, 4]' }]
        });

        const places = [
            { name: 'H Mart', types: ['grocery_or_supermarket'] },
            { name: 'Whole Foods', types: ['grocery_or_supermarket'] },
            { name: '99 Ranch Market', types: ['grocery_or_supermarket'] },
            { name: 'Trader Joe\'s', types: ['grocery_or_supermarket'] },
            { name: 'La Michoacana', types: ['grocery_or_supermarket'] }
        ];

        const res = await request(app)
            .post('/api/filter-places')
            .send({ userQuery: 'grocery store', places });

        expect(res.status).toBe(200);
    });

    it('distinguishes farmers market from grocery store', async () => {
        mockCreate.mockResolvedValue({
            content: [{ text: '[1, 2]' }]  // Traditional grocery only
        });

        const places = [
            { name: 'Saturday Farmers Market', types: ['food', 'point_of_interest'] },
            { name: 'Kroger', types: ['grocery_or_supermarket'] },
            { name: 'Publix', types: ['grocery_or_supermarket'] },
            { name: 'Local Harvest Farmers Market', types: ['food'] }
        ];

        const res = await request(app)
            .post('/api/filter-places')
            .send({ userQuery: 'grocery store', places });

        expect(res.status).toBe(200);
    });
});

describe('Edge Cases: Bank (Financial vs Geographic)', () => {
    beforeEach(() => {
        mockCreate.mockReset();
    });

    it('distinguishes financial banks from river banks/other meanings', async () => {
        mockCreate.mockResolvedValue({
            content: [{ text: '[0, 2, 4]' }]
        });

        const places = [
            { name: 'Chase Bank', types: ['bank', 'finance'] },
            { name: 'River Bank Park', types: ['park'] },
            { name: 'Wells Fargo', types: ['bank', 'atm'] },
            { name: 'West Bank Cafe', types: ['restaurant'] },
            { name: 'Bank of America', types: ['bank', 'finance'] },
            { name: 'The Bank Nightclub', types: ['night_club', 'bar'] }
        ];

        const res = await request(app)
            .post('/api/filter-places')
            .send({ userQuery: 'bank', places });

        expect(res.status).toBe(200);
    });
});

describe('Edge Cases: Pharmacy vs Drug Store vs Medical', () => {
    beforeEach(() => {
        mockCreate.mockReset();
    });

    it('handles pharmacy query with various store types', async () => {
        mockCreate.mockResolvedValue({
            content: [{ text: '[0, 1, 3]' }]
        });

        const places = [
            { name: 'CVS Pharmacy', types: ['pharmacy', 'store'] },
            { name: 'Walgreens', types: ['pharmacy', 'store'] },
            { name: 'GNC', types: ['store', 'health'] },                   // supplements, not pharmacy
            { name: 'Rite Aid', types: ['pharmacy', 'store'] },
            { name: 'The Vitamin Shoppe', types: ['store'] }               // supplements, not pharmacy
        ];

        const res = await request(app)
            .post('/api/filter-places')
            .send({ userQuery: 'pharmacy', places });

        expect(res.status).toBe(200);
    });
});

describe('Edge Cases: Restaurant Type Confusion', () => {
    beforeEach(() => {
        mockCreate.mockReset();
    });

    it('distinguishes fast food from sit-down restaurants', async () => {
        mockCreate.mockResolvedValue({
            content: [{ text: '[2, 3, 5]' }]
        });

        const places = [
            { name: 'McDonald\'s', types: ['restaurant', 'food'] },
            { name: 'Burger King', types: ['restaurant', 'food'] },
            { name: 'The Capital Grille', types: ['restaurant', 'food'] },
            { name: 'Ruth\'s Chris Steak House', types: ['restaurant'] },
            { name: 'Wendy\'s', types: ['restaurant', 'food'] },
            { name: 'Olive Garden', types: ['restaurant', 'food'] }
        ];

        const res = await request(app)
            .post('/api/filter-places')
            .send({ userQuery: 'nice restaurant', places });

        expect(res.status).toBe(200);
    });

    it('distinguishes food trucks from restaurants', async () => {
        mockCreate.mockResolvedValue({
            content: [{ text: '[1, 3]' }]
        });

        const places = [
            { name: 'Taco Truck Express', types: ['food', 'meal_takeaway'] },
            { name: 'Chipotle', types: ['restaurant', 'food'] },
            { name: 'Street Eats Food Truck', types: ['food'] },
            { name: 'Qdoba', types: ['restaurant', 'food'] }
        ];

        const res = await request(app)
            .post('/api/filter-places')
            .send({ userQuery: 'mexican restaurant', places });

        expect(res.status).toBe(200);
    });

    it('handles bar vs restaurant for food queries', async () => {
        mockCreate.mockResolvedValue({
            content: [{ text: '[1, 2]' }]
        });

        const places = [
            { name: 'The Tipsy Crow', types: ['bar', 'night_club'] },       // bar only
            { name: 'Applebee\'s', types: ['restaurant', 'bar'] },          // bar & grill
            { name: 'TGI Friday\'s', types: ['restaurant', 'bar'] },        // bar & grill
            { name: 'Club XS', types: ['night_club', 'bar'] }               // nightclub
        ];

        const res = await request(app)
            .post('/api/filter-places')
            .send({ userQuery: 'restaurant', places });

        expect(res.status).toBe(200);
    });
});

describe('Edge Cases: Auto Services Confusion', () => {
    beforeEach(() => {
        mockCreate.mockReset();
    });

    it('distinguishes auto parts store from repair shop', async () => {
        mockCreate.mockResolvedValue({
            content: [{ text: '[0, 1, 3]' }]
        });

        const places = [
            { name: 'AutoZone', types: ['car_repair', 'store'] },
            { name: 'O\'Reilly Auto Parts', types: ['store'] },
            { name: 'Jiffy Lube', types: ['car_repair'] },                   // service only
            { name: 'Advance Auto Parts', types: ['store'] },
            { name: 'Midas', types: ['car_repair'] }                         // service only
        ];

        const res = await request(app)
            .post('/api/filter-places')
            .send({ userQuery: 'auto parts store', places });

        expect(res.status).toBe(200);
    });

    it('distinguishes car wash from detailing from repair', async () => {
        mockCreate.mockResolvedValue({
            content: [{ text: '[0, 3]' }]
        });

        const places = [
            { name: 'Mister Car Wash', types: ['car_wash'] },
            { name: 'Midas', types: ['car_repair'] },
            { name: 'Precision Auto Detailing', types: ['car_wash'] },       // detailing
            { name: 'Delta Sonic', types: ['car_wash'] },
            { name: 'Firestone', types: ['car_repair'] }
        ];

        const res = await request(app)
            .post('/api/filter-places')
            .send({ userQuery: 'car wash', places });

        expect(res.status).toBe(200);
    });
});

describe('Edge Cases: Pet Services Confusion', () => {
    beforeEach(() => {
        mockCreate.mockReset();
    });

    it('distinguishes pet store from vet from groomer', async () => {
        mockCreate.mockResolvedValue({
            content: [{ text: '[0, 3]' }]
        });

        const places = [
            { name: 'PetSmart', types: ['pet_store', 'store'] },
            { name: 'Banfield Pet Hospital', types: ['veterinary_care'] },
            { name: 'Pawsitive Grooming', types: ['pet_store'] },            // groomer
            { name: 'Petco', types: ['pet_store', 'store'] },
            { name: 'Animal Emergency Clinic', types: ['veterinary_care'] }
        ];

        const res = await request(app)
            .post('/api/filter-places')
            .send({ userQuery: 'pet store', places });

        expect(res.status).toBe(200);
    });
});

describe('Edge Cases: College/University Buildings', () => {
    beforeEach(() => {
        mockCreate.mockReset();
    });

    it('distinguishes college buildings from places with college in name', async () => {
        mockCreate.mockResolvedValue({
            content: [{ text: '[0, 2, 4]' }]
        });

        const places = [
            { name: 'UW-Milwaukee Student Union', types: ['university', 'point_of_interest'] },
            { name: 'College Ave Bar & Grill', types: ['bar', 'restaurant'] },
            { name: 'Engineering Building - MSOE', types: ['university', 'establishment'] },
            { name: 'College Hunks Hauling Junk', types: ['moving_company'] },
            { name: 'Marquette University Library', types: ['library', 'university'] },
            { name: 'The College Dropout Barbershop', types: ['hair_care'] }
        ];

        const res = await request(app)
            .post('/api/filter-places')
            .send({ userQuery: 'college building', places });

        expect(res.status).toBe(200);
    });

    it('handles campus bookstore vs regular bookstore', async () => {
        mockCreate.mockResolvedValue({
            content: [{ text: '[0, 2]' }]
        });

        const places = [
            { name: 'UWM Bookstore', types: ['book_store', 'university'] },
            { name: 'Barnes & Noble', types: ['book_store'] },
            { name: 'Marquette Spirit Shop', types: ['book_store', 'clothing_store'] },
            { name: 'Half Price Books', types: ['book_store'] }
        ];

        const res = await request(app)
            .post('/api/filter-places')
            .send({ userQuery: 'college bookstore', places });

        expect(res.status).toBe(200);
    });

    it('distinguishes student center from other centers', async () => {
        mockCreate.mockResolvedValue({
            content: [{ text: '[1, 3]' }]
        });

        const places = [
            { name: 'College Square Shopping Center', types: ['shopping_mall'] },
            { name: 'Student Activity Center - UW', types: ['university', 'point_of_interest'] },
            { name: 'University Center Bank', types: ['bank'] },
            { name: 'Memorial Student Union', types: ['university', 'food'] },
            { name: 'Center Street Cafe', types: ['cafe'] }
        ];

        const res = await request(app)
            .post('/api/filter-places')
            .send({ userQuery: 'student center', places });

        expect(res.status).toBe(200);
    });

    it('handles university library vs public library', async () => {
        mockCreate.mockResolvedValue({
            content: [{ text: '[0, 3]' }]
        });

        const places = [
            { name: 'Golda Meir Library - UWM', types: ['library', 'university'] },
            { name: 'Milwaukee Public Library', types: ['library'] },
            { name: 'Shorewood Public Library', types: ['library'] },
            { name: 'Raynor Memorial Libraries - Marquette', types: ['library', 'university'] }
        ];

        const res = await request(app)
            .post('/api/filter-places')
            .send({ userQuery: 'university library', places });

        expect(res.status).toBe(200);
    });

    it('handles dorm vs apartment vs hotel', async () => {
        mockCreate.mockResolvedValue({
            content: [{ text: '[0, 2]' }]
        });

        const places = [
            { name: 'Sandburg Residence Hall - UWM', types: ['university', 'lodging'] },
            { name: 'The Residence Inn', types: ['lodging', 'hotel'] },
            { name: 'Cambridge Commons Dorms', types: ['university', 'lodging'] },
            { name: 'University Inn & Suites', types: ['hotel', 'lodging'] },
            { name: 'Campus Edge Apartments', types: ['real_estate_agency'] }  // off-campus housing
        ];

        const res = await request(app)
            .post('/api/filter-places')
            .send({ userQuery: 'dorm', places });

        expect(res.status).toBe(200);
    });

    it('handles campus gym vs commercial gym', async () => {
        mockCreate.mockResolvedValue({
            content: [{ text: '[0, 3]' }]
        });

        const places = [
            { name: 'Klotsche Center - UWM', types: ['gym', 'university'] },
            { name: 'Planet Fitness', types: ['gym'] },
            { name: 'LA Fitness', types: ['gym'] },
            { name: 'Rec Plex - Marquette', types: ['gym', 'university'] },
            { name: 'Anytime Fitness', types: ['gym'] }
        ];

        const res = await request(app)
            .post('/api/filter-places')
            .send({ userQuery: 'campus gym', places });

        expect(res.status).toBe(200);
    });
});

describe('Edge Cases: Ambiguous Single-Word Queries', () => {
    beforeEach(() => {
        mockCreate.mockReset();
    });

    it('handles ambiguous "apple" query', async () => {
        mockCreate.mockResolvedValue({
            content: [{ text: '[0, 2]' }]  // Assume they want Apple Store
        });

        const places = [
            { name: 'Apple Store', types: ['electronics_store', 'store'] },
            { name: 'Apple Farm Orchard', types: ['food', 'point_of_interest'] },
            { name: 'Apple Authorized Reseller', types: ['electronics_store'] },
            { name: 'Applebee\'s', types: ['restaurant'] }
        ];

        const res = await request(app)
            .post('/api/filter-places')
            .send({ userQuery: 'apple', places });

        expect(res.status).toBe(200);
    });

    it('handles ambiguous "target" query', async () => {
        mockCreate.mockResolvedValue({
            content: [{ text: '[0, 1]' }]
        });

        const places = [
            { name: 'Target', types: ['department_store', 'grocery_or_supermarket'] },
            { name: 'Target Optical', types: ['store', 'health'] },
            { name: 'On Target Shooting Range', types: ['point_of_interest'] },
            { name: 'Target Physical Therapy', types: ['health'] }
        ];

        const res = await request(app)
            .post('/api/filter-places')
            .send({ userQuery: 'target', places });

        expect(res.status).toBe(200);
    });

    it('handles ambiguous "shell" query', async () => {
        mockCreate.mockResolvedValue({
            content: [{ text: '[0, 2]' }]
        });

        const places = [
            { name: 'Shell Gas Station', types: ['gas_station'] },
            { name: 'Shell Beach', types: ['natural_feature'] },
            { name: 'Shell', types: ['gas_station', 'convenience_store'] },
            { name: 'Shells Seafood Restaurant', types: ['restaurant'] }
        ];

        const res = await request(app)
            .post('/api/filter-places')
            .send({ userQuery: 'shell', places });

        expect(res.status).toBe(200);
    });
});

describe('Edge Cases: Misspellings and Typos', () => {
    beforeEach(() => {
        mockCreate.mockReset();
    });

    it('handles misspelled "resturant" query', async () => {
        mockCreate.mockResolvedValue({
            content: [{ text: '[0, 1, 2]' }]
        });

        const places = [
            { name: 'Olive Garden', types: ['restaurant'] },
            { name: 'Chili\'s', types: ['restaurant', 'bar'] },
            { name: 'Outback Steakhouse', types: ['restaurant'] }
        ];

        const res = await request(app)
            .post('/api/filter-places')
            .send({ userQuery: 'resturant', places });  // misspelled

        expect(res.status).toBe(200);
    });

    it('handles misspelled "pharmcy" query', async () => {
        mockCreate.mockResolvedValue({
            content: [{ text: '[0, 1]' }]
        });

        const places = [
            { name: 'CVS', types: ['pharmacy'] },
            { name: 'Walgreens', types: ['pharmacy'] }
        ];

        const res = await request(app)
            .post('/api/filter-places')
            .send({ userQuery: 'pharmcy', places });  // misspelled

        expect(res.status).toBe(200);
    });

    it('handles misspelled "coffe" query', async () => {
        mockCreate.mockResolvedValue({
            content: [{ text: '[0, 2]' }]
        });

        const places = [
            { name: 'Starbucks', types: ['cafe'] },
            { name: 'Panera', types: ['restaurant'] },
            { name: 'Dunkin', types: ['cafe'] }
        ];

        const res = await request(app)
            .post('/api/filter-places')
            .send({ userQuery: 'coffe', places });  // misspelled

        expect(res.status).toBe(200);
    });
});

describe('Edge Cases: Complex Multi-Category Places', () => {
    beforeEach(() => {
        mockCreate.mockReset();
    });

    it('handles Walmart for various query types', async () => {
        const walmart = { name: 'Walmart Supercenter', types: ['department_store', 'grocery_or_supermarket', 'pharmacy', 'electronics_store'] };

        // Test grocery query
        mockCreate.mockResolvedValue({ content: [{ text: '[0]' }] });
        let res = await request(app)
            .post('/api/filter-places')
            .send({ userQuery: 'grocery', places: [walmart] });
        expect(res.status).toBe(200);

        // Test pharmacy query
        mockCreate.mockReset();
        mockCreate.mockResolvedValue({ content: [{ text: '[0]' }] });
        res = await request(app)
            .post('/api/filter-places')
            .send({ userQuery: 'pharmacy', places: [walmart] });
        expect(res.status).toBe(200);
    });

    it('handles gas station convenience store combos', async () => {
        mockCreate.mockResolvedValue({
            content: [{ text: '[0, 1, 2]' }]
        });

        const places = [
            { name: 'Kwik Trip', types: ['gas_station', 'convenience_store', 'store'] },
            { name: 'BP', types: ['gas_station'] },
            { name: 'Shell', types: ['gas_station', 'convenience_store'] }
        ];

        const res = await request(app)
            .post('/api/filter-places')
            .send({ userQuery: 'gas station', places });

        expect(res.status).toBe(200);
    });
});

describe('Edge Cases: Regional and Brand-Specific Names', () => {
    beforeEach(() => {
        mockCreate.mockReset();
    });

    it('recognizes regional grocery chains', async () => {
        mockCreate.mockResolvedValue({
            content: [{ text: '[0, 1, 2, 3, 4]' }]
        });

        const places = [
            { name: 'Publix', types: ['grocery_or_supermarket'] },           // Southeast
            { name: 'H-E-B', types: ['grocery_or_supermarket'] },            // Texas
            { name: 'Wegmans', types: ['grocery_or_supermarket'] },          // Northeast
            { name: 'Meijer', types: ['grocery_or_supermarket'] },           // Midwest
            { name: 'WinCo Foods', types: ['grocery_or_supermarket'] }       // West
        ];

        const res = await request(app)
            .post('/api/filter-places')
            .send({ userQuery: 'grocery store', places });

        expect(res.status).toBe(200);
    });

    it('recognizes regional coffee chains', async () => {
        mockCreate.mockResolvedValue({
            content: [{ text: '[0, 1, 2, 3, 4]' }]
        });

        const places = [
            { name: 'Dutch Bros', types: ['cafe'] },                         // West
            { name: 'Caribou Coffee', types: ['cafe'] },                     // Midwest
            { name: 'Wawa', types: ['convenience_store', 'cafe'] },          // East Coast
            { name: 'Colectivo Coffee', types: ['cafe'] },                   // Wisconsin
            { name: 'Philz Coffee', types: ['cafe'] }                        // California
        ];

        const res = await request(app)
            .post('/api/filter-places')
            .send({ userQuery: 'coffee', places });

        expect(res.status).toBe(200);
    });
});

describe('Edge Cases: Empty or Minimal Google Types', () => {
    beforeEach(() => {
        mockCreate.mockReset();
    });

    it('handles places with empty types array', async () => {
        mockCreate.mockResolvedValue({
            content: [{ text: '[0, 2]' }]
        });

        const places = [
            { name: 'Starbucks', types: [] },                                // missing types
            { name: 'Random Place', types: [] },
            { name: 'Dunkin Donuts', types: [] }                             // missing types
        ];

        const res = await request(app)
            .post('/api/filter-places')
            .send({ userQuery: 'coffee', places });

        expect(res.status).toBe(200);
    });

    it('handles places with only generic types', async () => {
        mockCreate.mockResolvedValue({
            content: [{ text: '[1]' }]
        });

        const places = [
            { name: 'Some Business', types: ['establishment', 'point_of_interest'] },
            { name: 'Michaels Arts and Crafts', types: ['establishment', 'point_of_interest'] },
            { name: 'Another Place', types: ['establishment'] }
        ];

        const res = await request(app)
            .post('/api/filter-places')
            .send({ userQuery: 'craft store', places });

        expect(res.status).toBe(200);
    });

    it('handles missing types property entirely', async () => {
        mockCreate.mockResolvedValue({
            content: [{ text: '[0, 1]' }]
        });

        const places = [
            { name: 'Starbucks', vicinity: '123 Main St' },                  // no types at all
            { name: 'Peet\'s Coffee', vicinity: '456 Oak Ave' }              // no types at all
        ];

        const res = await request(app)
            .post('/api/filter-places')
            .send({ userQuery: 'coffee', places });

        expect(res.status).toBe(200);
    });
});

describe('Edge Cases: Special Characters and Formatting', () => {
    beforeEach(() => {
        mockCreate.mockReset();
    });

    it('handles place names with apostrophes', async () => {
        mockCreate.mockResolvedValue({
            content: [{ text: '[0, 1, 2]' }]
        });

        const places = [
            { name: "Denny's", types: ['restaurant'] },
            { name: "Applebee's Grill + Bar", types: ['restaurant', 'bar'] },
            { name: "Chili's", types: ['restaurant'] },
            { name: "McDonald's", types: ['restaurant'] }
        ];

        const res = await request(app)
            .post('/api/filter-places')
            .send({ userQuery: 'sit down restaurant', places });

        expect(res.status).toBe(200);
    });

    it('handles place names with special characters', async () => {
        mockCreate.mockResolvedValue({
            content: [{ text: '[0, 1, 2]' }]
        });

        const places = [
            { name: 'Café Du Monde', types: ['cafe'] },
            { name: 'Taquería El Sol', types: ['restaurant'] },
            { name: 'Käserei Cheese Shop', types: ['store'] },
            { name: 'Böb\'s Burgers', types: ['restaurant'] }
        ];

        const res = await request(app)
            .post('/api/filter-places')
            .send({ userQuery: 'cafe', places });

        expect(res.status).toBe(200);
    });

    it('handles queries with special characters', async () => {
        mockCreate.mockResolvedValue({
            content: [{ text: '[0]' }]
        });

        const places = [
            { name: 'Starbucks', types: ['cafe'] },
            { name: 'Panera', types: ['restaurant'] }
        ];

        const res = await request(app)
            .post('/api/filter-places')
            .send({ userQuery: 'coffee & tea', places });

        expect(res.status).toBe(200);
    });
});

describe('Edge Cases: Numeric and Index Edge Cases', () => {
    beforeEach(() => {
        mockCreate.mockReset();
    });

    it('handles Claude returning out-of-bounds indices', async () => {
        mockCreate.mockResolvedValue({
            content: [{ text: '[0, 5, 10]' }]  // indices 5 and 10 don't exist
        });

        const places = [
            { name: 'Starbucks', types: ['cafe'] },
            { name: 'Dunkin', types: ['cafe'] }
        ];

        const res = await request(app)
            .post('/api/filter-places')
            .send({ userQuery: 'coffee', places });

        expect(res.status).toBe(200);
        // Should still return what Claude said, validation happens elsewhere
    });

    it('handles Claude returning duplicate indices', async () => {
        mockCreate.mockResolvedValue({
            content: [{ text: '[0, 0, 1, 1]' }]  // duplicates
        });

        const places = [
            { name: 'Starbucks', types: ['cafe'] },
            { name: 'Dunkin', types: ['cafe'] }
        ];

        const res = await request(app)
            .post('/api/filter-places')
            .send({ userQuery: 'coffee', places });

        expect(res.status).toBe(200);
    });

    it('handles Claude returning unsorted indices', async () => {
        mockCreate.mockResolvedValue({
            content: [{ text: '[3, 1, 4, 0, 2]' }]  // unsorted
        });

        const places = [
            { name: 'Place 0', types: ['cafe'] },
            { name: 'Place 1', types: ['cafe'] },
            { name: 'Place 2', types: ['cafe'] },
            { name: 'Place 3', types: ['cafe'] },
            { name: 'Place 4', types: ['cafe'] }
        ];

        const res = await request(app)
            .post('/api/filter-places')
            .send({ userQuery: 'coffee', places });

        expect(res.status).toBe(200);
        expect(res.body.filteredIndices).toEqual([3, 1, 4, 0, 2]);
    });

    it('handles large number of places', async () => {
        mockCreate.mockResolvedValue({
            content: [{ text: '[0, 5, 10, 14]' }]
        });

        const places = Array.from({ length: 15 }, (_, i) => ({
            name: `Place ${i}`,
            types: ['cafe']
        }));

        const res = await request(app)
            .post('/api/filter-places')
            .send({ userQuery: 'coffee', places });

        expect(res.status).toBe(200);
    });
});

// ============================================================
// ORIGINAL extractJsonArray TESTS
// ============================================================

describe('extractJsonArray', () => {
    it('extracts simple array', () => {
        expect(extractJsonArray('[0, 1, 2]')).toEqual([0, 1, 2]);
    });

    it('extracts array with no spaces', () => {
        expect(extractJsonArray('[0,1,2]')).toEqual([0, 1, 2]);
    });

    it('extracts array from text with explanation before', () => {
        const text = 'Based on the rules:\n\n[3, 5, 7]';
        expect(extractJsonArray(text)).toEqual([3, 5, 7]);
    });

    it('extracts array from text with explanation after', () => {
        const text = '[1, 2]\n\nThese are the matching indices.';
        expect(extractJsonArray(text)).toEqual([1, 2]);
    });

    it('extracts array from text with explanation before and after', () => {
        const text = 'Here are the results:\n[0, 4, 8]\nThese match your query.';
        expect(extractJsonArray(text)).toEqual([0, 4, 8]);
    });

    it('returns null for text without array', () => {
        expect(extractJsonArray('No matches found')).toBeNull();
    });

    it('returns empty array for empty brackets', () => {
        expect(extractJsonArray('[]')).toEqual([]);
    });

    it('handles newlines in array', () => {
        expect(extractJsonArray('[1,\n2,\n3]')).toEqual([1, 2, 3]);
    });
});
