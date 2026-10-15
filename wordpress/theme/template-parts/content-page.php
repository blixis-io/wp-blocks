<?php
/**
 * A page.
 *
 * @package Blixis\Theme
 */

?>
	<header class="entry-header">
		<h1 class="entry-title"><?php echo esc_html( get_the_title() ); ?></h1>
	</header>
	<div class="entry-content">
		<?php
		the_content();
		wp_link_pages();
		?>
	</div>
