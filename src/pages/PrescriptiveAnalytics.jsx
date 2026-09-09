import React from 'react';
import { FiBarChart2, FiTrendingUp, FiBox, FiTarget, FiRefreshCw, FiX, FiCheckCircle } from 'react-icons/fi';
import { FaRegLightbulb } from 'react-icons/fa';

export default function PrescriptiveAnalytics() {
    return (
        <div className="analytics-container">
            <style>{`
                .analytics-container {
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                    background-color: #f8fafc;
                    padding: 24px;
                    color: #0f172a;
                    min-height: 100vh;
                    box-sizing: border-box;
                }
                .analytics-container * { box-sizing: border-box; }
                
                .header-section {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: 24px;
                }
                .header-title h1 {
                    font-size: 28px;
                    color: #1e1b4b;
                    margin: 0 0 4px 0;
                    font-weight: 800;
                }
                .header-title p {
                    margin: 0;
                    color: #64748b;
                    font-size: 14px;
                }
                .header-quote {
                    text-align: right;
                    color: #3b82f6;
                    font-style: italic;
                    font-size: 14px;
                    line-height: 1.4;
                }

                .grid-container {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 20px;
                }

                .card {
                    background: white;
                    border: 1px solid #e2e8f0;
                    border-radius: 8px;
                    padding: 20px;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
                }

                .card-header {
                    display: flex;
                    align-items: flex-start;
                    gap: 12px;
                    margin-bottom: 20px;
                }
                .number-badge {
                    background: #2563eb;
                    color: white;
                    width: 28px;
                    height: 28px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: 700;
                    font-size: 14px;
                    flex-shrink: 0;
                }
                .card-title-box h2 {
                    margin: 0;
                    font-size: 18px;
                    color: #1e1b4b;
                }
                .card-title-box p {
                    margin: 4px 0 0 0;
                    font-size: 13px;
                    color: #64748b;
                }

                /* Sliders */
                .slider-row {
                    display: flex;
                    align-items: center;
                    margin-bottom: 20px;
                    gap: 16px;
                }
                .slider-icon {
                    width: 40px;
                    height: 40px;
                    border-radius: 8px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 20px;
                    flex-shrink: 0;
                }
                .slider-info {
                    flex: 1;
                }
                .slider-info h4 {
                    margin: 0;
                    font-size: 14px;
                    color: #1e1b4b;
                }
                .slider-info p {
                    margin: 2px 0 0 0;
                    font-size: 12px;
                    color: #64748b;
                }
                .slider-track {
                    flex: 1;
                    height: 6px;
                    background: #e2e8f0;
                    border-radius: 3px;
                    position: relative;
                }
                .slider-fill {
                    position: absolute;
                    left: 0;
                    top: 0;
                    height: 100%;
                    background: #2563eb;
                    border-radius: 3px;
                }
                .slider-thumb {
                    position: absolute;
                    top: 50%;
                    transform: translateY(-50%);
                    width: 16px;
                    height: 16px;
                    background: #2563eb;
                    border-radius: 50%;
                    cursor: pointer;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.2);
                }
                .slider-value {
                    width: 48px;
                    padding: 4px 8px;
                    border: 1px solid #e2e8f0;
                    border-radius: 4px;
                    text-align: center;
                    font-size: 13px;
                    font-weight: 600;
                    color: #1e1b4b;
                }

                .total-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 16px 24px;
                    background: #eff6ff;
                    border-radius: 8px;
                    margin-top: 24px;
                    font-weight: 700;
                    color: #1e40af;
                    font-size: 15px;
                }

                .btn-reset {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    margin: 16px auto 0;
                    padding: 8px 16px;
                    background: white;
                    border: 1px solid #e2e8f0;
                    border-radius: 6px;
                    color: #2563eb;
                    font-weight: 600;
                    cursor: pointer;
                    font-size: 13px;
                }

                /* Tables */
                table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 12px;
                }
                th {
                    text-align: left;
                    padding: 10px 8px;
                    color: #1e40af;
                    font-weight: 600;
                    border-bottom: 2px solid #e2e8f0;
                }
                td {
                    padding: 10px 8px;
                    border-bottom: 1px solid #f1f5f9;
                    color: #1e1b4b;
                }
                .badge {
                    padding: 4px 12px;
                    border-radius: 4px;
                    font-weight: 700;
                    font-size: 11px;
                    text-align: center;
                    display: inline-block;
                    width: 70px;
                }
                .badge-high { background: #dcfce7; color: #166534; }
                .badge-medium { background: #fef08a; color: #854d0e; }
                .badge-low { background: #fee2e2; color: #991b1b; }

                .pagination {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-top: 16px;
                    font-size: 12px;
                    color: #64748b;
                }
                .page-btns {
                    display: flex;
                    gap: 4px;
                }
                .page-btn {
                    padding: 4px 10px;
                    border: 1px solid #e2e8f0;
                    background: white;
                    border-radius: 4px;
                    color: #475569;
                    cursor: pointer;
                }
                .page-btn.active {
                    background: #2563eb;
                    color: white;
                    border-color: #2563eb;
                }

                /* Right Bottom */
                .rec-header {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 18px;
                    font-weight: 700;
                    color: #1e1b4b;
                }
                .rec-subtitle {
                    font-size: 13px;
                    color: #64748b;
                    margin-bottom: 16px;
                }
                
                .score-section {
                    display: flex;
                    gap: 24px;
                    margin-bottom: 24px;
                }
                .donut-container {
                    width: 120px;
                    height: 120px;
                    position: relative;
                }
                .donut-text {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    text-align: center;
                }
                .donut-text h3 { margin: 0; font-size: 24px; color: #1e1b4b; }
                .donut-text p { margin: 0; font-size: 12px; color: #64748b; }
                
                .breakdown {
                    flex: 1;
                }
                .breakdown-title {
                    font-size: 13px;
                    font-weight: 700;
                    color: #1e1b4b;
                    margin-bottom: 12px;
                }
                .bar-row {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    margin-bottom: 8px;
                    font-size: 12px;
                }
                .bar-label { width: 130px; color: #475569; }
                .bar-bg { flex: 1; height: 8px; background: #f1f5f9; border-radius: 4px; }
                .bar-fill { height: 100%; border-radius: 4px; }
                .bar-value { width: 24px; text-align: right; color: #1e1b4b; font-weight: 600; }

                .rec-bottom {
                    display: flex;
                    gap: 24px;
                }
                .indicators {
                    flex: 1;
                }
                .indicators-title { font-size: 13px; font-weight: 700; color: #1e1b4b; margin-bottom: 12px; }
                .indicator-row {
                    display: flex;
                    justify-content: space-between;
                    padding: 6px 0;
                    border-bottom: 1px solid #f1f5f9;
                    font-size: 12px;
                }
                .indicator-row span:first-child { color: #475569; }
                .indicator-row span:last-child { color: #1e1b4b; font-weight: 600; }
                .text-green { color: #16a34a !important; }

                .reasons {
                    flex: 1;
                    background: #f8fafc;
                    padding: 16px;
                    border-radius: 8px;
                    border: 1px solid #e2e8f0;
                }
                .reasons-title {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 13px;
                    font-weight: 700;
                    color: #1e40af;
                    margin-bottom: 12px;
                }
                .reason-item {
                    display: flex;
                    align-items: flex-start;
                    gap: 8px;
                    font-size: 12px;
                    color: #334155;
                    margin-bottom: 8px;
                }
                .reason-icon { color: #16a34a; font-size: 14px; flex-shrink: 0; }
            `}</style>

            <div className="header-section">
                <div className="header-title">
                    <h1>Prescriptive Analytics</h1>
                    <p>Identify and prioritize the best opportunities for market expansion.</p>
                </div>
                <div className="header-quote">
                    *Data-driven priorities<br />for a stronger tomorrow.*
                </div>
            </div>

            <div className="grid-container">
                {/* 1. Strategy Priorities */}
                <div className="card">
                    <div className="card-header">
                        <div className="number-badge">1</div>
                        <div className="card-title-box">
                            <h2>Strategy Priorities</h2>
                            <p>Set the importance of each criterion for the Regional Opportunity Score (ROS).</p>
                        </div>
                    </div>

                    <div className="slider-row">
                        <div className="slider-icon" style={{background:'#eff6ff', color:'#3b82f6'}}><FiBarChart2 /></div>
                        <div className="slider-info">
                            <h4>Current Performance</h4>
                            <p>Historical sales performance</p>
                        </div>
                        <div className="slider-track"><div className="slider-fill" style={{width:'30%'}}></div><div className="slider-thumb" style={{left:'30%'}}></div></div>
                        <div className="slider-value">30 <span style={{color:'#64748b'}}>%</span></div>
                    </div>
                    
                    <div className="slider-row">
                        <div className="slider-icon" style={{background:'#dcfce7', color:'#16a34a'}}><FiTrendingUp /></div>
                        <div className="slider-info">
                            <h4>Future Growth</h4>
                            <p>Projected demand growth</p>
                        </div>
                        <div className="slider-track"><div className="slider-fill" style={{width:'25%'}}></div><div className="slider-thumb" style={{left:'25%'}}></div></div>
                        <div className="slider-value">25 <span style={{color:'#64748b'}}>%</span></div>
                    </div>

                    <div className="slider-row">
                        <div className="slider-icon" style={{background:'#f3e8ff', color:'#a855f7'}}><FiBox /></div>
                        <div className="slider-info">
                            <h4>Product Demand</h4>
                            <p>Demand and popularity of products</p>
                        </div>
                        <div className="slider-track"><div className="slider-fill" style={{width:'25%'}}></div><div className="slider-thumb" style={{left:'25%'}}></div></div>
                        <div className="slider-value">25 <span style={{color:'#64748b'}}>%</span></div>
                    </div>

                    <div className="slider-row">
                        <div className="slider-icon" style={{background:'#fee2e2', color:'#ef4444'}}><FiTarget /></div>
                        <div className="slider-info">
                            <h4>Market Opportunity</h4>
                            <p>Untapped market potential</p>
                        </div>
                        <div className="slider-track"><div className="slider-fill" style={{width:'20%'}}></div><div className="slider-thumb" style={{left:'20%'}}></div></div>
                        <div className="slider-value">20 <span style={{color:'#64748b'}}>%</span></div>
                    </div>

                    <div className="total-row">
                        <span>Total</span>
                        <span>100%</span>
                    </div>
                    <button className="btn-reset">
                        <FiRefreshCw /> Reset to Default
                    </button>
                </div>

                {/* 2. Regional / Market Opportunity */}
                <div className="card">
                    <div className="card-header" style={{justifyContent: 'space-between'}}>
                        <div style={{display:'flex', gap:'12px'}}>
                            <div className="number-badge">2</div>
                            <div className="card-title-box">
                                <h2>Regional / Market Opportunity</h2>
                                <p>Ranked province-product opportunities based on the weighted score.</p>
                            </div>
                        </div>
                        <select style={{padding:'6px 12px', border:'1px solid #e2e8f0', borderRadius:'6px', color:'#1e1b4b', fontSize:'13px', outline:'none'}}>
                            <option>All Products</option>
                        </select>
                    </div>

                    <table>
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Province</th>
                                <th>Product</th>
                                <th style={{textAlign:'center'}}>Opportunity Score</th>
                                <th style={{textAlign:'center'}}>Priority</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr><td>1</td><td>Cebu</td><td>Product A</td><td style={{textAlign:'center'}}>91.4</td><td style={{textAlign:'center'}}><div className="badge badge-high">HIGH</div></td></tr>
                            <tr><td>2</td><td>Laguna</td><td>Product C</td><td style={{textAlign:'center'}}>87.2</td><td style={{textAlign:'center'}}><div className="badge badge-high">HIGH</div></td></tr>
                            <tr><td>3</td><td>Cavite</td><td>Product B</td><td style={{textAlign:'center'}}>82.8</td><td style={{textAlign:'center'}}><div className="badge badge-high">HIGH</div></td></tr>
                            <tr><td>4</td><td>Rizal</td><td>Product D</td><td style={{textAlign:'center'}}>78.6</td><td style={{textAlign:'center'}}><div className="badge badge-medium">MEDIUM</div></td></tr>
                            <tr><td>5</td><td>Batangas</td><td>Product E</td><td style={{textAlign:'center'}}>75.1</td><td style={{textAlign:'center'}}><div className="badge badge-medium">MEDIUM</div></td></tr>
                            <tr><td>6</td><td>Quezon</td><td>Product F</td><td style={{textAlign:'center'}}>72.3</td><td style={{textAlign:'center'}}><div className="badge badge-medium">MEDIUM</div></td></tr>
                            <tr><td>7</td><td>Bulacan</td><td>Product G</td><td style={{textAlign:'center'}}>68.9</td><td style={{textAlign:'center'}}><div className="badge badge-medium">MEDIUM</div></td></tr>
                            <tr><td>8</td><td>Pampanga</td><td>Product H</td><td style={{textAlign:'center'}}>65.4</td><td style={{textAlign:'center'}}><div className="badge badge-low">LOW</div></td></tr>
                            <tr><td>9</td><td>Iloilo</td><td>Product I</td><td style={{textAlign:'center'}}>62.1</td><td style={{textAlign:'center'}}><div className="badge badge-low">LOW</div></td></tr>
                            <tr><td>10</td><td>Davao del Sur</td><td>Product J</td><td style={{textAlign:'center'}}>59.7</td><td style={{textAlign:'center'}}><div className="badge badge-low">LOW</div></td></tr>
                        </tbody>
                    </table>
                    <div className="pagination">
                        Showing 1 to 10 of 248 opportunities
                        <div className="page-btns">
                            <button className="page-btn">&lt;</button>
                            <button className="page-btn active">1</button>
                            <button className="page-btn">2</button>
                            <button className="page-btn">3</button>
                            <button className="page-btn">4</button>
                            <button className="page-btn">5</button>
                            <button className="page-btn" style={{border:'none', background:'transparent'}}>..</button>
                            <button className="page-btn">25</button>
                            <button className="page-btn">&gt;</button>
                        </div>
                    </div>
                </div>

                {/* 3. Geographic Ranking */}
                <div className="card">
                    <div className="card-header">
                        <div className="number-badge">3</div>
                        <div className="card-title-box">
                            <h2>Geographic Ranking</h2>
                            <p>Provinces ranked by overall opportunity.</p>
                        </div>
                    </div>
                    
                    <table>
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Province</th>
                                <th>ROS</th>
                                <th style={{textAlign:'center'}}>Historical<br/>Performance</th>
                                <th style={{textAlign:'center'}}>Projected<br/>Growth</th>
                                <th style={{textAlign:'center'}}>Product<br/>Demand</th>
                                <th style={{textAlign:'center'}}>Market<br/>Opportunity</th>
                                <th style={{textAlign:'center'}}>Priority</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr><td>1</td><td>Cebu</td><td>91.4</td><td style={{textAlign:'center'}}>94</td><td style={{textAlign:'center'}}>89</td><td style={{textAlign:'center'}}>92</td><td style={{textAlign:'center'}}>90</td><td style={{textAlign:'center'}}><div className="badge badge-high">HIGH</div></td></tr>
                            <tr><td>2</td><td>Laguna</td><td>87.2</td><td style={{textAlign:'center'}}>88</td><td style={{textAlign:'center'}}>85</td><td style={{textAlign:'center'}}>87</td><td style={{textAlign:'center'}}>89</td><td style={{textAlign:'center'}}><div className="badge badge-high">HIGH</div></td></tr>
                            <tr><td>3</td><td>Cavite</td><td>82.8</td><td style={{textAlign:'center'}}>84</td><td style={{textAlign:'center'}}>80</td><td style={{textAlign:'center'}}>86</td><td style={{textAlign:'center'}}>81</td><td style={{textAlign:'center'}}><div className="badge badge-high">HIGH</div></td></tr>
                            <tr><td>4</td><td>Rizal</td><td>78.6</td><td style={{textAlign:'center'}}>80</td><td style={{textAlign:'center'}}>76</td><td style={{textAlign:'center'}}>82</td><td style={{textAlign:'center'}}>76</td><td style={{textAlign:'center'}}><div className="badge badge-medium">MEDIUM</div></td></tr>
                            <tr><td>5</td><td>Batangas</td><td>75.1</td><td style={{textAlign:'center'}}>77</td><td style={{textAlign:'center'}}>73</td><td style={{textAlign:'center'}}>78</td><td style={{textAlign:'center'}}>72</td><td style={{textAlign:'center'}}><div className="badge badge-medium">MEDIUM</div></td></tr>
                            <tr><td>6</td><td>Quezon</td><td>72.3</td><td style={{textAlign:'center'}}>74</td><td style={{textAlign:'center'}}>70</td><td style={{textAlign:'center'}}>75</td><td style={{textAlign:'center'}}>70</td><td style={{textAlign:'center'}}><div className="badge badge-medium">MEDIUM</div></td></tr>
                            <tr><td>7</td><td>Bulacan</td><td>68.9</td><td style={{textAlign:'center'}}>70</td><td style={{textAlign:'center'}}>67</td><td style={{textAlign:'center'}}>71</td><td style={{textAlign:'center'}}>67</td><td style={{textAlign:'center'}}><div className="badge badge-medium">MEDIUM</div></td></tr>
                            <tr><td>8</td><td>Pampanga</td><td>65.4</td><td style={{textAlign:'center'}}>66</td><td style={{textAlign:'center'}}>63</td><td style={{textAlign:'center'}}>68</td><td style={{textAlign:'center'}}>64</td><td style={{textAlign:'center'}}><div className="badge badge-low">LOW</div></td></tr>
                            <tr><td>9</td><td>Iloilo</td><td>62.1</td><td style={{textAlign:'center'}}>64</td><td style={{textAlign:'center'}}>60</td><td style={{textAlign:'center'}}>65</td><td style={{textAlign:'center'}}>59</td><td style={{textAlign:'center'}}><div className="badge badge-low">LOW</div></td></tr>
                            <tr><td>10</td><td>Davao del Sur</td><td>59.7</td><td style={{textAlign:'center'}}>61</td><td style={{textAlign:'center'}}>58</td><td style={{textAlign:'center'}}>62</td><td style={{textAlign:'center'}}>57</td><td style={{textAlign:'center'}}><div className="badge badge-low">LOW</div></td></tr>
                        </tbody>
                    </table>
                    <div className="pagination">
                        Showing 1 to 10 of 82 provinces
                        <div className="page-btns">
                            <button className="page-btn">&lt;</button>
                            <button className="page-btn active">1</button>
                            <button className="page-btn">2</button>
                            <button className="page-btn">3</button>
                            <button className="page-btn">4</button>
                            <button className="page-btn">5</button>
                            <button className="page-btn" style={{border:'none', background:'transparent'}}>..</button>
                            <button className="page-btn">9</button>
                            <button className="page-btn">&gt;</button>
                        </div>
                    </div>
                </div>

                {/* 4. Why This Recommendation? */}
                <div className="card" style={{position:'relative'}}>
                    <div style={{position:'absolute', top:'20px', right:'20px', color:'#64748b', cursor:'pointer'}}><FiX size={20}/></div>
                    <div className="card-header">
                        <div className="number-badge">4</div>
                        <div className="card-title-box">
                            <h2>Why This Recommendation?</h2>
                            <p>Detailed explanation of the selected opportunity.</p>
                        </div>
                    </div>

                    <div style={{display:'flex', alignItems:'center', gap:'12px', marginBottom:'24px'}}>
                        <h2 style={{margin:0, fontSize:'20px', color:'#1e1b4b'}}>Cebu <span style={{color:'#16a34a'}}>×</span> Product A</h2>
                        <div className="badge badge-high" style={{width:'auto'}}>HIGH PRIORITY</div>
                    </div>

                    <div className="score-section">
                        <div className="donut-container">
                            <svg width="120" height="120" viewBox="0 0 120 120">
                                <circle cx="60" cy="60" r="50" fill="none" stroke="#e2e8f0" strokeWidth="12" />
                                <circle cx="60" cy="60" r="50" fill="none" stroke="#16a34a" strokeWidth="12" strokeDasharray="314" strokeDashoffset="27" transform="rotate(-90 60 60)" strokeLinecap="round" />
                            </svg>
                            <div className="donut-text">
                                <h3>91.4</h3>
                                <p>/ 100</p>
                            </div>
                            <div style={{textAlign:'center', marginTop:'12px', fontSize:'13px', fontWeight:600, color:'#1e1b4b'}}>Opportunity Score</div>
                        </div>
                        <div className="breakdown">
                            <div className="breakdown-title">Score Breakdown</div>
                            <div className="bar-row">
                                <div className="bar-label">Current Performance</div>
                                <div className="bar-bg"><div className="bar-fill" style={{width:'94%', background:'#3b82f6'}}></div></div>
                                <div className="bar-value">94</div>
                            </div>
                            <div className="bar-row">
                                <div className="bar-label">Future Growth</div>
                                <div className="bar-bg"><div className="bar-fill" style={{width:'89%', background:'#16a34a'}}></div></div>
                                <div className="bar-value">89</div>
                            </div>
                            <div className="bar-row">
                                <div className="bar-label">Product Demand</div>
                                <div className="bar-bg"><div className="bar-fill" style={{width:'92%', background:'#a855f7'}}></div></div>
                                <div className="bar-value">92</div>
                            </div>
                            <div className="bar-row">
                                <div className="bar-label">Market Opportunity</div>
                                <div className="bar-bg"><div className="bar-fill" style={{width:'90%', background:'#f97316'}}></div></div>
                                <div className="bar-value">90</div>
                            </div>
                        </div>
                    </div>

                    <div className="rec-bottom">
                        <div className="indicators">
                            <div className="indicators-title">Supporting Indicators</div>
                            <div className="indicator-row"><span>Historical Revenue</span><span>₱ 32.84M</span></div>
                            <div className="indicator-row"><span>Historical Quantity</span><span>128,420</span></div>
                            <div className="indicator-row"><span>Projected Demand</span><span>148,200</span></div>
                            <div className="indicator-row"><span>Growth Rate</span><span className="text-green">+16.4%</span></div>
                            <div className="indicator-row"><span>Average Order Value</span><span>₱ 780.21</span></div>
                        </div>
                        <div className="reasons">
                            <div className="reasons-title"><FaRegLightbulb size={16}/> Why is this ranked highly?</div>
                            <div className="reason-item"><FiCheckCircle className="reason-icon"/> Strong historical sales performance in Cebu</div>
                            <div className="reason-item"><FiCheckCircle className="reason-icon"/> High projected demand growth (16.4%)</div>
                            <div className="reason-item"><FiCheckCircle className="reason-icon"/> Consistent product demand and order volume</div>
                            <div className="reason-item"><FiCheckCircle className="reason-icon"/> Significant untapped market potential</div>
                            <div className="reason-item"><FiCheckCircle className="reason-icon"/> Aligned with strategic expansion areas</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}