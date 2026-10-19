<?php
/** Read-only product fixture for Pro renderer tests.
 *
 * @package Blixis\Pro\Tests
 */

declare(strict_types=1);

namespace Blixis\Pro\Tests;

/** Supplies product values through the WooCommerce public method shape. */
final class WooCommerceProductStub {
	/** Create a product fixture.
	 *
	 * @param string $name      Product name.
	 * @param string $url       Product URL.
	 * @param bool   $available Purchasability and stock state.
	 * @param string $price     Price markup.
	 */
	public function __construct( private string $name, private string $url, private bool $available, private string $price ) {}

	/** Product name. */
	public function get_name(): string {
		return $this->name; }

	/** Product permalink. */
	public function get_permalink(): string {
		return $this->url; }

	/** Purchasability state. */
	public function is_purchasable(): bool {
		return $this->available; }

	/** Stock state. */
	public function is_in_stock(): bool {
		return $this->available; }

	/** WooCommerce formatted price. */
	public function get_price_html(): string {
		return $this->price; }
}
