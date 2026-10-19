<?php
/** Safe, read-only WooCommerce element adapter.
 *
 * @package Blixis\Pro
 */

declare(strict_types=1);

namespace Blixis\Pro;

use Blixis\Builder\Render\ElementNode;
use Blixis\Builder\Render\ElementRenderer;
use Blixis\Builder\Render\Escape;
use Blixis\Builder\Render\RenderContext;

/** Renders product and cart display without invoking checkout or payment APIs. */
final class WooCommerceRenderer implements ElementRenderer {
	/** Optional pure adapters for deterministic tests and non-WooCommerce hosts.
	 *
	 * @var callable(array<string,mixed>):mixed|null
	 */
	private $product_query;
	/** Optional HTML sanitizer for deterministic tests.
	 *
	 * @var callable(string):string|null
	 */
	private $html_sanitizer;

	/** Construct a commerce renderer with optional test adapters.
	 *
	 * @param string                                   $kind           Commerce definition id.
	 * @param callable(array<string,mixed>):mixed|null $product_query Optional bounded product query adapter.
	 * @param ?callable(string):string                 $html_sanitizer Optional safe markup sanitizer.
	 */
	public function __construct( private readonly string $kind, ?callable $product_query = null, ?callable $html_sanitizer = null ) {
		$this->product_query  = $product_query;
		$this->html_sanitizer = $html_sanitizer;
	}

	/** Render safe, escaped visitor markup.
	 *
	 * @param ElementNode   $node Element data.
	 * @param RenderContext $context Render context.
	 */
	public function render( ElementNode $node, RenderContext $context ): string {
		$hooks = Escape::hooks( $node );
		if ( $context->preview || ( ! class_exists( '\\WooCommerce' ) && null === $this->product_query ) ) {
			return '<span' . $hooks . '>' . Escape::html( $this->label( $node ) ) . '</span>';
		}
		return match ( $this->kind ) {
			'cart-icon' => $this->cart( $node, $hooks ),
			'product-grid', 'upsells', 'cross-sells' => $this->products( $node, $hooks ),
			'product-card' => '<article' . $hooks . '>' . $context->children_html . '</article>',
			'product-title', 'product-image', 'product-gallery', 'product-price', 'product-rating', 'add-to-cart', 'product-stock', 'product-description', 'product-tabs', 'product-variants' => $this->product_element( $this->kind, $node, $hooks ),
			'mini-cart', 'cart-table', 'checkout-summary' => $this->cart_summary( $node, $hooks ),
			'account-menu' => $this->account_menu( $node, $hooks ),
			'product-search' => $this->product_search( $node, $hooks ),
			'product-categories', 'product-filters' => $this->product_categories( $node, $hooks ),
			'order-summary' => $this->order_summary( $node, $hooks ),
			'checkout-form' => $this->checkout_link( $node, $hooks ),
			default => '<span' . $hooks . '>' . Escape::html( $this->label( $node ) ) . '</span>',
		};
	}

	/** Render a cart link using WooCommerce's public read-only cart APIs.
	 *
	 * @param ElementNode $node Element data.
	 * @param string      $hooks Safe element attributes.
	 */
	private function cart( ElementNode $node, string $hooks ): string {
		$label = $this->label( $node );
		$url   = function_exists( 'wc_get_cart_url' ) ? wc_get_cart_url() : '';
		if ( ! is_string( $url ) || '' === $url || ! function_exists( 'esc_url' ) ) {
			return '<span' . $hooks . '>' . Escape::html( $label ) . '</span>';
		}
		$count = 0;
		$cart  = function_exists( 'WC' ) ? WC()->cart : null;
		if ( is_object( $cart ) && is_callable( [ $cart, 'get_cart_contents_count' ] ) ) {
			$count = max( 0, (int) $cart->get_cart_contents_count() );
		}
		$show_count = true === $node->value( 'showCount', true );
		$suffix     = $show_count ? ' <span class="blx-cart-count">' . (string) $count . '</span>' : '';
		if ( true === $node->value( 'showSubtotal', false ) && is_object( $cart ) && is_callable( [ $cart, 'get_cart_subtotal' ] ) && function_exists( 'wp_kses_post' ) ) {
			$suffix .= ' <span class="blx-cart-subtotal">' . wp_kses_post( $cart->get_cart_subtotal() ) . '</span>';
		}
		return '<a' . $hooks . ' href="' . esc_url( $url ) . '">' . Escape::html( $label ) . $suffix . '</a>';
	}

	/** Render a bounded product list, with every product value escaped.
	 *
	 * @param ElementNode $node Element data.
	 * @param string      $hooks Safe element attributes.
	 */
	private function products( ElementNode $node, string $hooks ): string {
		if ( null === $this->product_query && ! function_exists( 'wc_get_products' ) ) {
			return '<div' . $hooks . '>' . Escape::html( $this->label( $node ) ) . '</div>';
		}
		$limit = max( 1, min( 12, (int) $node->value( 'maxItems', 4 ) ) );
		$query = [
			'status' => 'publish',
			'limit'  => $limit,
			'return' => 'objects',
		];
		if ( null !== $this->product_query ) {
			$products = ( $this->product_query )( $query );
		} elseif ( function_exists( 'wc_get_products' ) ) {
			$products = wc_get_products( $query );
		} else {
			return '<div' . $hooks . '>' . Escape::html( $this->label( $node ) ) . '</div>';
		}
		if ( ! is_array( $products ) ) {
			$products = [];
		}
		$html = '<div' . $hooks . ' class="blx-product-grid">';
		foreach ( $products as $product ) {
			if ( ! is_object( $product ) || ! is_callable( [ $product, 'get_name' ] ) || ! is_callable( [ $product, 'get_permalink' ] ) ) {
				continue;
			}
			$name      = (string) $product->get_name();
			$url       = (string) $product->get_permalink();
			$available = ( ! is_callable( [ $product, 'is_purchasable' ] ) || $product->is_purchasable() ) && ( ! is_callable( [ $product, 'is_in_stock' ] ) || $product->is_in_stock() );
			$html     .= '<article class="blx-product-card' . ( $available ? ' is-available' : ' is-unavailable' ) . '"><a href="' . Escape::url( $url ) . '">' . Escape::html( $name ) . '</a>';
			if ( is_callable( [ $product, 'get_price_html' ] ) ) {
				$html .= '<div class="price">' . $this->safe_html( (string) $product->get_price_html() ) . '</div>';
			}
			if ( ! $available ) {
				$html .= '<span class="availability">' . ( function_exists( 'esc_html__' ) ? esc_html__( 'Currently unavailable', 'blixis-pro' ) : 'Currently unavailable' ) . '</span>';
			}
			$html .= '</article>';
		}
		return $html . '</div>';
	}

	/** Sanitize WooCommerce's supported price markup, or escape as plain text outside WordPress.
	 *
	 * @param string $html WooCommerce display value.
	 */
	private function safe_html( string $html ): string {
		if ( null !== $this->html_sanitizer ) {
			return ( $this->html_sanitizer )( $html );
		}
		return function_exists( 'wp_kses_post' ) ? wp_kses_post( $html ) : Escape::html( $html );
	}

	/** Render one read-only product value in a published WooCommerce product context.
	 *
	 * @param string      $element Commerce element id.
	 * @param ElementNode $node    Element data.
	 * @param string      $hooks   Safe element attributes.
	 */
	private function product_element( string $element, ElementNode $node, string $hooks ): string {
		$product = $this->current_product( $node );
		if ( null === $product ) {
			return '<span' . $hooks . '>' . Escape::html( $this->label( $node ) ) . '</span>';
		}
		if ( in_array( $element, [ 'product-title', 'product-card' ], true ) && is_callable( [ $product, 'get_name' ] ) ) {
			return '<span' . $hooks . '>' . Escape::html( (string) $product->get_name() ) . '</span>';
		}
		if ( 'product-price' === $element && is_callable( [ $product, 'get_price_html' ] ) && function_exists( 'wp_kses_post' ) ) {
			return '<span' . $hooks . '>' . wp_kses_post( $product->get_price_html() ) . '</span>';
		}
		if ( 'product-description' === $element && is_callable( [ $product, 'get_short_description' ] ) && function_exists( 'wp_kses_post' ) ) {
			return '<div' . $hooks . '>' . wp_kses_post( $product->get_short_description() ) . '</div>';
		}
		if ( 'product-stock' === $element && is_callable( [ $product, 'get_stock_status' ] ) ) {
			$in_stock = 'instock' === $product->get_stock_status();
			$message  = $in_stock ? esc_html__( 'In stock', 'blixis-pro' ) : esc_html__( 'Currently unavailable', 'blixis-pro' );
			return '<span' . $hooks . ' class="blx-product-stock" data-available="' . ( $in_stock ? 'true' : 'false' ) . '">' . $message . '</span>';
		}
		if ( 'product-rating' === $element && is_callable( [ $product, 'get_average_rating' ] ) ) {
			$rating = max( 0.0, min( 5.0, (float) $product->get_average_rating() ) );
			/* translators: %s: average product rating out of five. */
			$label = sprintf( __( 'Rated %s out of 5', 'blixis-pro' ), number_format_i18n( $rating, 1 ) );
			return '<span' . $hooks . ' role="img" aria-label="' . Escape::attr( $label ) . '">' . Escape::html( number_format_i18n( $rating, 1 ) ) . ' / 5</span>';
		}
		if ( 'product-image' === $element && is_callable( [ $product, 'get_image' ] ) && function_exists( 'wp_kses_post' ) ) {
			return '<figure' . $hooks . '>' . wp_kses_post( $product->get_image() ) . '</figure>';
		}
		if ( 'product-gallery' === $element && is_callable( [ $product, 'get_gallery_image_ids' ] ) && function_exists( 'wp_get_attachment_image' ) && function_exists( 'wp_kses_post' ) ) {
			$html = '<div' . $hooks . ' class="blx-product-gallery">';
			$ids  = $product->get_gallery_image_ids();
			foreach ( is_array( $ids ) ? array_slice( $ids, 0, 12 ) : [] as $attachment_id ) {
				if ( is_int( $attachment_id ) && $attachment_id > 0 ) {
					$html .= wp_kses_post( wp_get_attachment_image( $attachment_id, 'woocommerce_thumbnail' ) );
				}
			}
			return $html . '</div>';
		}
		if ( 'product-tabs' === $element && is_callable( [ $product, 'get_description' ] ) && function_exists( 'wp_kses_post' ) ) {
			return '<details' . $hooks . '><summary>' . Escape::html( $this->label( $node ) ) . '</summary><div>' . wp_kses_post( $product->get_description() ) . '</div></details>';
		}
		if ( in_array( $element, [ 'add-to-cart', 'product-variants' ], true ) ) {
			return $this->product_action( $element, $product, $node, $hooks );
		}
		return '<span' . $hooks . '>' . Escape::html( $this->label( $node ) ) . '</span>';
	}

	/** Resolve only published product objects.
	 *
	 * @param ElementNode $node Element data.
	 * @return object|null Product object.
	 */
	private function current_product( ElementNode $node ): ?object {
		$product_id = $node->value( 'productId' );
		$product    = is_int( $product_id ) && $product_id > 0 && function_exists( 'wc_get_product' ) ? wc_get_product( $product_id ) : ( $GLOBALS['product'] ?? null );
		if ( ! is_object( $product ) || ! is_callable( [ $product, 'get_status' ] ) || 'publish' !== $product->get_status() ) {
			return null;
		}
		return $product;
	}

	/** Render links to WooCommerce's own product or checkout actions.
	 *
	 * @param string      $element Commerce element id.
	 * @param object      $product Product object.
	 * @param ElementNode $node    Element data.
	 * @param string      $hooks   Safe element attributes.
	 */
	private function product_action( string $element, object $product, ElementNode $node, string $hooks ): string {
		$url = is_callable( [ $product, 'get_permalink' ] ) ? (string) $product->get_permalink() : '';
		if ( '' === $url ) {
			return '<span' . $hooks . '>' . Escape::html( $this->label( $node ) ) . '</span>';
		}
		if ( 'add-to-cart' === $element && is_callable( [ $product, 'is_type' ] ) && $product->is_type( 'simple' ) && is_callable( [ $product, 'is_purchasable' ] ) && $product->is_purchasable() && is_callable( [ $product, 'is_in_stock' ] ) && $product->is_in_stock() && is_callable( [ $product, 'add_to_cart_url' ] ) ) {
			$url = (string) $product->add_to_cart_url();
			return '<a' . $hooks . ' href="' . Escape::url( $url ) . '">' . Escape::html( $this->label( $node ) ) . '</a>';
		}
		return '<a' . $hooks . ' href="' . Escape::url( $url ) . '">' . Escape::html( $this->label( $node ) ) . '</a>';
	}

	/** Render a read-only cart summary.
	 *
	 * @param ElementNode $node  Element data.
	 * @param string      $hooks Safe element attributes.
	 */
	private function cart_summary( ElementNode $node, string $hooks ): string {
		$cart  = function_exists( 'WC' ) ? WC()->cart : null;
		$items = is_object( $cart ) && is_callable( [ $cart, 'get_cart' ] ) ? $cart->get_cart() : [];
		if ( ! is_array( $items ) ) {
			$items = [];
		}
		$html = '<div' . $hooks . ' class="blx-cart-summary"><ul>';
		foreach ( array_slice( $items, 0, 20 ) as $item ) {
			$product = is_array( $item ) ? ( $item['data'] ?? null ) : null;
			if ( ! is_object( $product ) || ! is_callable( [ $product, 'get_name' ] ) ) {
				continue;
			}
			$quantity = is_array( $item ) ? max( 1, min( 99, (int) ( $item['quantity'] ?? 1 ) ) ) : 1;
			$html    .= '<li>' . Escape::html( (string) $product->get_name() ) . ' <span>' . (string) $quantity . '</span></li>';
		}
		$html .= '</ul>';
		if ( function_exists( 'wc_get_cart_url' ) ) {
			$html .= '<a href="' . Escape::url( (string) wc_get_cart_url() ) . '">' . Escape::html( $this->label( $node ) ) . '</a>';
		}
		return $html . '</div>';
	}

	/** Render account endpoints through WooCommerce's own URL helpers.
	 *
	 * @param ElementNode $node  Element data.
	 * @param string      $hooks Safe element attributes.
	 */
	private function account_menu( ElementNode $node, string $hooks ): string {
		if ( ! function_exists( 'wc_get_page_permalink' ) || ! function_exists( 'wc_get_account_endpoint_url' ) ) {
			return '<span' . $hooks . '>' . Escape::html( $this->label( $node ) ) . '</span>';
		}
		$account = (string) wc_get_page_permalink( 'myaccount' );
		if ( '' === $account ) {
			return '<span' . $hooks . '>' . Escape::html( $this->label( $node ) ) . '</span>';
		}
		$items = [
			'dashboard'    => __( 'Dashboard', 'blixis-pro' ),
			'orders'       => __( 'Orders', 'blixis-pro' ),
			'edit-address' => __( 'Addresses', 'blixis-pro' ),
			'edit-account' => __( 'Account details', 'blixis-pro' ),
		];
		$html  = '<nav' . $hooks . ' aria-label="' . Escape::attr( $this->label( $node ) ) . '"><ul>';
		foreach ( $items as $endpoint => $label ) {
			if ( 'dashboard' !== $endpoint && function_exists( 'is_user_logged_in' ) && ! is_user_logged_in() ) {
				continue;
			}
			$html .= '<li><a href="' . Escape::url( (string) wc_get_account_endpoint_url( $endpoint ) ) . '">' . esc_html( $label ) . '</a></li>';
		}
		return $html . '</ul></nav>';
	}

	/** Render product search as a same-site GET form.
	 *
	 * @param ElementNode $node  Element data.
	 * @param string      $hooks Safe element attributes.
	 */
	private function product_search( ElementNode $node, string $hooks ): string {
		$action = function_exists( 'home_url' ) ? (string) home_url( '/' ) : '/';
		$label  = $this->label( $node );
		return '<form' . $hooks . ' method="get" action="' . Escape::url( $action ) . '"><label>' . Escape::html( $label ) . '<input type="search" name="s" value=""><input type="hidden" name="post_type" value="product"></label><button type="submit">' . Escape::html( $label ) . '</button></form>';
	}

	/** Render public product category links.
	 *
	 * @param ElementNode $node  Element data.
	 * @param string      $hooks Safe element attributes.
	 */
	private function product_categories( ElementNode $node, string $hooks ): string {
		if ( ! function_exists( 'get_terms' ) || ! function_exists( 'get_term_link' ) ) {
			return '<span' . $hooks . '>' . Escape::html( $this->label( $node ) ) . '</span>';
		}
		$terms = get_terms(
			[
				'taxonomy'   => 'product_cat',
				'hide_empty' => true,
				'number'     => 20,
			]
		);
		if ( ! is_array( $terms ) ) {
			return '<span' . $hooks . '>' . Escape::html( $this->label( $node ) ) . '</span>';
		}
		$html = '<nav' . $hooks . ' aria-label="' . Escape::attr( $this->label( $node ) ) . '"><ul>';
		foreach ( $terms as $term ) {
			if ( ! is_object( $term ) ) {
				continue;
			}
			$url = get_term_link( $term );
			if ( ! is_string( $url ) ) {
				continue;
			}
			$html .= '<li><a href="' . Escape::url( $url ) . '">' . Escape::html( (string) $term->name ) . '</a></li>';
		}
		return $html . '</ul></nav>';
	}

	/** Render a checkout link without implementing checkout or payment processing.
	 *
	 * @param ElementNode $node  Element data.
	 * @param string      $hooks Safe element attributes.
	 */
	private function checkout_link( ElementNode $node, string $hooks ): string {
		$url = function_exists( 'wc_get_checkout_url' ) ? (string) wc_get_checkout_url() : '';
		return '' === $url ? '<span' . $hooks . '>' . Escape::html( $this->label( $node ) ) . '</span>' : '<a' . $hooks . ' href="' . Escape::url( $url ) . '">' . Escape::html( $this->label( $node ) ) . '</a>';
	}

	/** Render a user's recent orders without exposing another customer's data.
	 *
	 * @param ElementNode $node  Element data.
	 * @param string      $hooks Safe element attributes.
	 */
	private function order_summary( ElementNode $node, string $hooks ): string {
		if ( ! function_exists( 'is_user_logged_in' ) || ! is_user_logged_in() || ! function_exists( 'get_current_user_id' ) || ! function_exists( 'wc_get_orders' ) ) {
			return '<span' . $hooks . '>' . Escape::html( $this->label( $node ) ) . '</span>';
		}
		$orders = wc_get_orders(
			[
				'customer_id' => get_current_user_id(),
				'limit'       => 5,
				'orderby'     => 'date',
				'order'       => 'DESC',
			]
		);
		if ( ! is_array( $orders ) ) {
			return '<span' . $hooks . '>' . Escape::html( $this->label( $node ) ) . '</span>';
		}
		$html = '<ul' . $hooks . '>';
		foreach ( $orders as $order ) {
			if ( ! is_object( $order ) || ! is_callable( [ $order, 'get_order_number' ] ) || ! is_callable( [ $order, 'get_status' ] ) ) {
				continue;
			}
			$html .= '<li>' . Escape::html( (string) $order->get_order_number() ) . ' — ' . Escape::html( (string) $order->get_status() ) . '</li>';
		}
		return $html . '</ul>';
	}

	/** Select a nonempty localized label with a safe default.
	 *
	 * @param ElementNode $node Element data.
	 */
	private function label( ElementNode $node ): string {
		$value = $node->value( 'label', $node->value( 'ariaLabel', 'View cart' ) );
		return is_string( $value ) && '' !== trim( $value ) ? trim( $value ) : 'View cart';
	}
}
